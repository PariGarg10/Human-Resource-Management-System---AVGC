const express = require('express');
const { format, startOfYear, endOfYear, getDay } = require('date-fns');
const { pool } = require('../db');
const { authMiddleware, requireRoles, enforcePasswordChange } = require('../middleware/auth');
const { parseYmdLocal, getSaturdayConfigMerged } = require('../utils/saturdayConfigRange');

const router = express.Router();

function assertSaturday(dateStr) {
  const d = parseYmdLocal(dateStr);
  if (!d) return false;
  return getDay(d) === 6;
}

function rangeFromQuery(query) {
  const { month, year, from, to } = query;
  if (from && to) {
    return { from: String(from).slice(0, 10), to: String(to).slice(0, 10) };
  }
  const yr = Number(year);
  const mo = Number(month);
  if (yr >= 2000 && yr <= 2100 && mo >= 1 && mo <= 12) {
    const fromStr = `${yr}-${String(mo).padStart(2, '0')}-01`;
    const last = new Date(yr, mo, 0).getDate();
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

router.use(authMiddleware);
router.use(enforcePasswordChange);

router.get('/', async (req, res) => {
  try {
    const range = rangeFromQuery(req.query);
    if (!range) {
      return res.status(400).json({
        message: 'Provide year, or month+year, or from+to (YYYY-MM-DD)',
      });
    }

    const entries = await getSaturdayConfigMerged(range.from, range.to);
    return res.json({ from: range.from, to: range.to, entries });
  } catch (err) {
    console.error('GET /saturday-config:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', requireRoles('admin'), async (req, res) => {
  const entries = req.body && Array.isArray(req.body.entries) ? req.body.entries : null;
  if (!entries || !entries.length) {
    return res.status(400).json({ message: 'entries array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const raw of entries) {
      const date = typeof raw.date === 'string' ? raw.date.slice(0, 10) : '';
      const status = raw.status === 'working' || raw.status === 'off' ? raw.status : null;
      if (!date || !status) {
        throw new Error('Each entry needs date (YYYY-MM-DD) and status "working" or "off"');
      }
      if (!assertSaturday(date)) {
        throw new Error(`Not a Saturday: ${date}`);
      }
      await client.query(
        `
        INSERT INTO saturday_config (date, status, created_by, updated_at)
        VALUES ($1::date, $2, $3, NOW())
        ON CONFLICT (date) DO UPDATE SET
          status = EXCLUDED.status,
          created_by = EXCLUDED.created_by,
          updated_at = NOW()
      `,
        [date, status, req.user.id]
      );
    }

    await client.query('COMMIT');
    return res.json({ ok: true, updated: entries.length });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.message && !e.code) {
      return res.status(400).json({ message: e.message || 'Update failed' });
    }
    console.error('POST /saturday-config:', e.message);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
