const { pool } = require('../db');

function pad2(value) {
  return String(value).padStart(2, '0');
}

function normalizeHolidayDate(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = require('xlsx').SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
  }

  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;

  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) return `${slash[3]}-${pad2(slash[2])}-${pad2(slash[1])}`;

  const parsedDate = new Date(raw);
  if (!Number.isNaN(parsedDate.getTime())) {
    return `${parsedDate.getFullYear()}-${pad2(parsedDate.getMonth() + 1)}-${pad2(parsedDate.getDate())}`;
  }

  return null;
}

function isValidHolidayDate(value) {
  const date = normalizeHolidayDate(value);
  if (!date) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day &&
    year >= 2000 &&
    year <= 2100
  );
}

/** @returns {Promise<{ id: number, holidayName: string, date: string, type: string }[]>} */
async function getHolidaysForRange(fromStr, toStr) {
  const from = normalizeHolidayDate(fromStr);
  const to = normalizeHolidayDate(toStr);
  if (!from || !to) return [];
  const { rows } = await pool.query(
    `
      SELECT id, holiday_name AS "holidayName", date::text AS date, type
      FROM holidays
      WHERE date BETWEEN $1::date AND $2::date
      ORDER BY date ASC, id ASC
    `,
    [from, to]
  );
  return rows.map((row) => ({ ...row, date: normalizeHolidayDate(row.date) || row.date }));
}

/** @returns {Promise<Set<string>>} */
async function getHolidayDatesSet(fromStr, toStr) {
  const holidays = await getHolidaysForRange(fromStr, toStr);
  return new Set(holidays.map((r) => r.date));
}

async function isHolidayDate(dateStr) {
  const date = normalizeHolidayDate(dateStr);
  if (!date) return false;
  const set = await getHolidayDatesSet(date, date);
  return set.has(date);
}

module.exports = { getHolidaysForRange, getHolidayDatesSet, isHolidayDate, normalizeHolidayDate, isValidHolidayDate };
