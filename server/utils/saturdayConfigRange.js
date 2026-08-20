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

/** 1st/3rd/5th Saturday working; 2nd/4th off (common alternate pattern). */
function defaultSaturdayStatus(dateStr) {
  const dt = parseYmdLocal(dateStr);
  if (!dt) return 'working';
  const y = dt.getFullYear();
  const m = dt.getMonth();
  const dayOfMonth = dt.getDate();
  let saturdayIndex = 0;
  for (let d = 1; d <= dayOfMonth; d += 1) {
    if (new Date(y, m, d).getDay() === 6) saturdayIndex += 1;
  }
  return saturdayIndex % 2 === 0 ? 'off' : 'working';
}

function resolveSaturdayStatus(dateStr, storedStatus) {
  const defaultStatus = defaultSaturdayStatus(dateStr);
  if (!storedStatus) return defaultStatus;
  if (storedStatus === 'off' && defaultStatus === 'working') return defaultStatus;
  return storedStatus;
}

/** Every Saturday in [fromStr, toStr] with status from DB or alternate default. */
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
        status: resolveSaturdayStatus(date, row.status),
        createdBy: row.createdBy,
        updatedAt: row.updatedAt,
      };
    }
    return { date, status: defaultSaturdayStatus(date), createdBy: null, updatedAt: null };
  });
}

module.exports = {
  parseYmdLocal,
  saturdaysBetweenInclusive,
  defaultSaturdayStatus,
  resolveSaturdayStatus,
  getSaturdayConfigMerged,
};
