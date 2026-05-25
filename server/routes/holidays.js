const express = require('express');
const multer = require('multer');
const { getUploadsRoot } = require('../utils/storagePaths');
const XLSX = require('xlsx');
const { format, getDaysInMonth, startOfYear, endOfYear } = require('date-fns');
const { pool } = require('../db');
const { authMiddleware, enforcePasswordChange } = require('../middleware/auth');
const { requireAdminAccess } = require('../middleware/adminAuth');
const { requirePermission, PERMISSION_MODULES } = require('../utils/adminPermissions');
const { getHolidaysForRange, normalizeHolidayDate, isValidHolidayDate } = require('../utils/holidaysRange');
const { logAudit } = require('../utils/audit');

const router = express.Router();
const ALLOWED_TYPES = new Set(['national', 'festival', 'optional']);
const uploadDir = getUploadsRoot('holidays');
const upload = multer({ dest: uploadDir });
const TYPE_ALIASES = new Map([
  ['national', 'national'],
  ['national holiday', 'national'],
  ['festival', 'festival'],
  ['festival holiday', 'festival'],
  ['optional', 'optional'],
  ['optional holiday', 'optional'],
]);
const IMPORT_BATCH_SIZE = 250;

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
  if (yr >= 2000 && yr <= 2100 && mo >= 1 && mo <= 12) {
    const fromStr = `${yr}-${String(mo).padStart(2, '0')}-01`;
    const last = getDaysInMonth(new Date(yr, mo - 1));
    const toStr = `${yr}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { from: fromStr, to: toStr };
  }
  if (yr >= 2000 && yr <= 2100) {
    return {
      from: format(startOfYear(new Date(yr, 0, 1)), 'yyyy-MM-dd'),
      to: format(endOfYear(new Date(yr, 0, 1)), 'yyyy-MM-dd'),
    };
  }
  return null;
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeHolidayType(value) {
  const key = normalizeHeader(value || 'national');
  return TYPE_ALIASES.get(key) || null;
}

function parseHolidayWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  const headerIndex = matrix.findIndex((row) => row.some((cell) => String(cell || '').trim()));
  if (headerIndex === -1) throw new Error('Uploaded file is empty');

  const headers = matrix[headerIndex].map(normalizeHeader);
  const nameIndex = headers.findIndex((h) => ['holiday name', 'holiday', 'name'].includes(h));
  const dateIndex = headers.findIndex((h) => ['date', 'holiday date'].includes(h));
  const typeIndex = headers.findIndex((h) => ['type', 'holiday type'].includes(h));
  if (nameIndex === -1 || dateIndex === -1 || typeIndex === -1) {
    throw new Error('Missing required columns: Holiday Name, Date, and Type');
  }

  return matrix
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell || '').trim()))
    .map((row, index) => ({
      rowNumber: headerIndex + index + 2,
      holidayName: String(row[nameIndex] || '').trim(),
      date: normalizeHolidayDate(row[dateIndex]),
      type: normalizeHolidayType(row[typeIndex]),
    }));
}

function holidayRowError(row) {
  if (!row.holidayName || !isValidHolidayDate(row.date)) {
    return 'Holiday Name and valid Date are required';
  }
  if (!row.type || !ALLOWED_TYPES.has(row.type)) {
    return 'Type must be National Holiday, Festival, or Optional';
  }
  return null;
}

function validateHolidayRows(rows) {
  const seenDates = new Set();
  return rows.map((row) => {
    const baseError = holidayRowError(row);
    if (baseError) return { row, error: baseError };
    if (seenDates.has(row.date)) {
      return { row, error: 'Duplicate holiday date in uploaded file' };
    }
    seenDates.add(row.date);
    return { row, error: null };
  });
}

function postgresErrorMessage(error) {
  if (error.code === '23505') return 'Holiday already exists for this date';
  return error.message || 'Invalid row';
}

async function insertHolidayBatch(rows) {
  if (rows.length === 0) return 0;
  const params = [];
  const values = rows.map((row, index) => {
    const base = index * 3;
    params.push(row.holidayName, row.date, row.type);
    return `($${base + 1}, $${base + 2}::date, $${base + 3})`;
  });
  const result = await pool.query(
    `
      INSERT INTO holidays (holiday_name, date, type)
      VALUES ${values.join(', ')}
      ON CONFLICT (date) DO UPDATE SET
        holiday_name = EXCLUDED.holiday_name,
        type = EXCLUDED.type
    `,
    params
  );
  return result.rowCount;
}

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

router.post('/', requireAdminAccess, requirePermission(PERMISSION_MODULES.HOLIDAY_CALENDAR), async (req, res) => {
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
    await logAudit(req.user.id, 'HOLIDAY_CREATED', 'holidays', { id, date: dateStr });
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

router.put('/:id', requireAdminAccess, requirePermission(PERMISSION_MODULES.HOLIDAY_CALENDAR), async (req, res) => {
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
    await logAudit(req.user.id, 'HOLIDAY_UPDATED', 'holidays', { id });
    return res.json({ id, holidayName: nextName, date: nextDate, type: nextType });
  } catch (err) {
    console.error('PUT /holidays/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/import/preview', requireAdminAccess, requirePermission(PERMISSION_MODULES.HOLIDAY_CALENDAR), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Holiday Excel file is required' });
  try {
    const rows = parseHolidayWorkbook(req.file.path);
    fs.unlink(req.file.path, () => {});
    const errors = validateHolidayRows(rows)
      .filter((result) => result.error)
      .map((result) => ({ row: result.row.rowNumber, error: result.error }));
    return res.json({ totalrows: rows.length, preview: rows.slice(0, 100), errors });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: error.message || 'Unable to parse holiday Excel file' });
  }
});

router.post('/import', requireAdminAccess, requirePermission(PERMISSION_MODULES.HOLIDAY_CALENDAR), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Holiday Excel file is required' });
  try {
    const rows = parseHolidayWorkbook(req.file.path);
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

    fs.unlink(req.file.path, () => {});
    await logAudit(req.user.id, 'HOLIDAYS_IMPORTED', 'holidays', summary);
    return res.json(summary);
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: error.message || 'Unable to import holiday Excel file' });
  }
});

router.delete('/:id', requireAdminAccess, requirePermission(PERMISSION_MODULES.HOLIDAY_CALENDAR), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    const r = await pool.query('DELETE FROM holidays WHERE id = $1', [id]);
    if (r.rowCount === 0) return res.status(404).json({ message: 'Holiday not found' });
    await logAudit(req.user.id, 'HOLIDAY_DELETED', 'holidays', { id });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /holidays/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
