const { format, eachDayOfInterval, getDay } = require('date-fns');
const { pool } = require('../db');

function parseYmdLocal(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function saturdaysBetweenInclusive(fromStr, toStr) {
  const start = parseYmdLocal(fromStr);
  const end = parseYmdLocal(toStr);
  if (!start || !end || start > end) return [];
  const dates = [];
  for (const day of eachDayOfInterval({ start, end })) {
    if (getDay(day) === 6) dates.push(format(day, 'yyyy-MM-dd'));
  }
  return dates;
}

/** Every Saturday in [fromStr, toStr] with status from DB or default `off`. */
async function getSaturdayConfigMerged(fromStr, toStr) {
  const saturdays = saturdaysBetweenInclusive(fromStr, toStr);
  if (!saturdays.length) return [];

  const { rows } = await pool.query(
    `SELECT date::text AS date, status, created_by AS "createdBy", updated_at AS "updatedAt"
     FROM saturday_config
     WHERE date >= $1::date AND date <= $2::date`,
    [fromStr, toStr]
  );

  const byDate = new Map(rows.map((r) => [r.date, r]));

  return saturdays.map((date) => {
    const row = byDate.get(date);
    if (row) {
      return {
        date,
        status: row.status,
        createdBy: row.createdBy,
        updatedAt: row.updatedAt,
      };
    }
    return { date, status: 'off', createdBy: null, updatedAt: null };
  });
}

module.exports = { parseYmdLocal, saturdaysBetweenInclusive, getSaturdayConfigMerged };
