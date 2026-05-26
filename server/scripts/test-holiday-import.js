require('dotenv').config();
const { pool } = require('../db');
const { buildSampleWorkbookBuffer, parseHolidayWorkbookBuffer, validateHolidayRows } = require('../utils/holidayImport');

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

(async () => {
  const buf = buildSampleWorkbookBuffer();
  const rows = parseHolidayWorkbookBuffer(buf);
  const validRows = validateHolidayRows(rows).filter((r) => !r.error).map((r) => r.row);
  console.log('valid rows', validRows.length);
  try {
    const n = await insertHolidayBatch(validRows);
    console.log('insert ok', n);
  } catch (e) {
    console.error('insert fail', e.code, e.message, e.detail);
  }
  try {
    await pool.query(
      'INSERT INTO auditlogs (actorid, action, resource, details) VALUES ($1, $2, $3, $4)',
      [1, 'HOLIDAYS_IMPORTED', 'holidays', JSON.stringify({ test: true })]
    );
    console.log('audit ok');
  } catch (e) {
    console.error('audit fail', e.code, e.message);
  }
  const cols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'holidays' ORDER BY 1"
  );
  console.log('holidays columns', cols.rows.map((r) => r.column_name));
  await pool.end();
})();
