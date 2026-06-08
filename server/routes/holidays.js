const express = require('express');
const multer = require('multer');
const { format, getDaysInMonth, startOfYear, endOfYear } = require('date-fns');
const { pool } = require('../db');
const { authMiddleware, enforcePasswordChange } = require('../middleware/auth');
const { requireAdminAccess } = require('../middleware/adminAuth');
const { requireHolidayManage } = require('../middleware/holidayManage');
const { getHolidaysForRange, normalizeHolidayDate, isValidHolidayDate } = require('../utils/holidaysRange');
const {
  ALLOWED_TYPES,
  parseHolidayWorkbookBuffer,
  validateHolidayRows,
  buildSampleWorkbookBuffer,
} = require('../utils/holidayImport');
const { logAudit } = require('../utils/audit');
const { MIN_PORTAL_YEAR, MAX_PORTAL_YEAR } = require('../constants/portalYear');

const router = express.Router();
const IMPORT_BATCH_SIZE = 250;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

function uploadSingle(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || 'File upload failed' });
      }
      return next();
    });
  };
}

const adminHoliday = [requireAdminAccess, requireHolidayManage];

router.use(authMiddleware);
router.use(enforcePasswordChange);

function rangeFromQuery(query) {
  const { month, year, from, to } = query;
  if (from && to) {
    const fromDate = normalizeHolidayDate(from);
    const toDate = normalizeHolidayDate(to);
    if (fromDate && toDate) return { from: fromDate, to: toDate };
    return null;
  }
  const yr = Number(year);
  const mo = Number(month);
  if (yr >= MIN_PORTAL_YEAR && yr <= MAX_PORTAL_YEAR && mo >= 1 && mo <= 12) {
    const fromStr = `${yr}-${String(mo).padStart(2, '0')}-01`;
    const last = getDaysInMonth(new Date(yr, mo - 1));
    const toStr = `${yr}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { from: fromStr, to: toStr };
  }
  if (yr >= MIN_PORTAL_YEAR && yr <= MAX_PORTAL_YEAR) {
    return {
      from: format(startOfYear(new Date(yr, 0, 1)), 'yyyy-MM-dd'),
      to: format(endOfYear(new Date(yr, 0, 1)), 'yyyy-MM-dd'),
    };
  }
  return null;
}

function postgresErrorMessage(error) {
  if (error.code === '23505') return 'Holiday already exists for this date';
  return error.message || 'Invalid row';
}

async function upsertHolidayRow(row) {
  await pool.query(
    `
      INSERT INTO holidays (holiday_name, date, type)
      VALUES ($1, $2::date, $3)
      ON CONFLICT (date) DO UPDATE SET
        holiday_name = EXCLUDED.holiday_name,
        type = EXCLUDED.type
    `,
    [row.holidayName, row.date, row.type]
  );
}

async function insertHolidayBatch(rows) {
  if (rows.length === 0) return 0;
  let count = 0;
  for (const row of rows) {
    await upsertHolidayRow(row);
    count += 1;
  }
  return count;
}

function auditActorId(req) {
  return req.adminEmployeeId || req.user?.id || null;
}

function handleRouteError(res, label, error, fallbackStatus = 500) {
  console.error(label, error.stack || error.message);
  const status = error.statusCode || fallbackStatus;
  return res.status(status).json({
    message: error.message || 'Holiday operation failed',
  });
}

router.get('/import/sample', ...adminHoliday, (_req, res) => {
  try {
    const buffer = buildSampleWorkbookBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="holiday-import-sample.xlsx"');
    return res.send(buffer);
  } catch (err) {
    console.error('GET /holidays/import/sample:', err.message);
    return res.status(500).json({ message: 'Could not generate sample file' });
  }
});

router.post('/import/preview', ...adminHoliday, uploadSingle('file'), async (req, res) => {
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ message: 'Holiday Excel file is required (field name: file)' });
  }
  try {
    const rows = parseHolidayWorkbookBuffer(req.file.buffer);
    const errors = validateHolidayRows(rows)
      .filter((result) => result.error)
      .map((result) => ({ row: result.row.rowNumber, error: result.error }));
    return res.json({ totalrows: rows.length, preview: rows.slice(0, 100), errors });
  } catch (error) {
    const isParse = /empty|column|parse|worksheet|required/i.test(String(error.message));
    return handleRouteError(res, 'POST /holidays/import/preview:', error, isParse ? 400 : 500);
  }
});

router.post('/import', ...adminHoliday, uploadSingle('file'), async (req, res) => {
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ message: 'Holiday Excel file is required (field name: file)' });
  }
  try {
    const rows = parseHolidayWorkbookBuffer(req.file.buffer);
    const summary = { totalrows: rows.length, successfulimports: 0, failedrows: 0, errors: [] };
    const validRows = [];

    for (const { row, error } of validateHolidayRows(rows)) {
      if (error) {
        summary.failedrows += 1;
        summary.errors.push({ row: row.rowNumber, error });
      } else {
        validRows.push(row);
      }
    }

    try {
      for (let index = 0; index < validRows.length; index += IMPORT_BATCH_SIZE) {
        const batch = validRows.slice(index, index + IMPORT_BATCH_SIZE);
        summary.successfulimports += await insertHolidayBatch(batch);
      }
    } catch (error) {
      summary.failedrows += validRows.length - summary.successfulimports;
      summary.errors.push({ row: null, error: postgresErrorMessage(error) });
    }

    await logAudit(auditActorId(req), 'HOLIDAYS_IMPORTED', 'holidays', summary);
    return res.json(summary);
  } catch (error) {
    const isParse = /empty|column|parse|worksheet|required/i.test(String(error.message));
    return handleRouteError(res, 'POST /holidays/import:', error, isParse ? 400 : 500);
  }
});

router.get('/', async (req, res) => {
  try {
    const range = rangeFromQuery(req.query);
    if (!range) {
      return res.status(400).json({ message: 'Provide year, or month+year, or from+to (YYYY-MM-DD)' });
    }
    const holidays = await getHolidaysForRange(range.from, range.to);
    return res.json({ from: range.from, to: range.to, holidays });
  } catch (err) {
    console.error('GET /holidays:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', ...adminHoliday, async (req, res) => {
  try {
    const { holidayName, date, type } = req.body || {};
    if (!holidayName || !date || !type) {
      return res.status(400).json({ message: 'holidayName, date, and type are required' });
    }
    if (!ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ message: 'type must be national, festival, or optional' });
    }
    const dateStr = normalizeHolidayDate(date);
    if (!isValidHolidayDate(dateStr)) {
      return res.status(400).json({ message: 'date must be DD/MM/YYYY or YYYY-MM-DD' });
    }

    const r = await pool.query(
      'INSERT INTO holidays (holiday_name, date, type) VALUES ($1, $2::date, $3) RETURNING id',
      [String(holidayName).trim(), dateStr, type]
    );
    const id = r.rows[0].id;
    await logAudit(auditActorId(req), 'HOLIDAY_CREATED', 'holidays', { id, date: dateStr });
    return res.status(201).json({
      id,
      holidayName: String(holidayName).trim(),
      date: dateStr,
      type,
    });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(400).json({ message: 'Holiday already exists for this date' });
    }
    console.error('POST /holidays:', e.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/:id', ...adminHoliday, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    const existingResult = await pool.query('SELECT id FROM holidays WHERE id = $1', [id]);
    if (!existingResult.rows[0]) return res.status(404).json({ message: 'Holiday not found' });

    const { holidayName, date, type } = req.body || {};
    if (type && !ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ message: 'type must be national, festival, or optional' });
    }
    const rowResult = await pool.query('SELECT holiday_name, date::text AS date, type FROM holidays WHERE id = $1', [id]);
    const row = rowResult.rows[0];
    const nextName = holidayName != null ? String(holidayName).trim() : row.holiday_name;
    const nextDate = date != null ? normalizeHolidayDate(date) : normalizeHolidayDate(row.date);
    const nextType = type != null ? type : row.type;
    if (!isValidHolidayDate(nextDate)) {
      return res.status(400).json({ message: 'date must be DD/MM/YYYY or YYYY-MM-DD' });
    }

    await pool.query('UPDATE holidays SET holiday_name = $1, date = $2::date, type = $3 WHERE id = $4', [
      nextName,
      nextDate,
      nextType,
      id,
    ]);
    await logAudit(auditActorId(req), 'HOLIDAY_UPDATED', 'holidays', { id });
    return res.json({ id, holidayName: nextName, date: nextDate, type: nextType });
  } catch (err) {
    console.error('PUT /holidays/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:id', ...adminHoliday, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    const r = await pool.query('DELETE FROM holidays WHERE id = $1', [id]);
    if (r.rowCount === 0) return res.status(404).json({ message: 'Holiday not found' });
    await logAudit(auditActorId(req), 'HOLIDAY_DELETED', 'holidays', { id });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /holidays/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
