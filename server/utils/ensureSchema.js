const { pool } = require('../db');

let employeeColumnsReady = false;

/** Lightweight migrations so login/API work without a manual db:init. */
async function ensureEmployeeSchemaColumns() {
  if (employeeColumnsReady) return;
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation TEXT');
  await pool.query(
    'ALTER TABLE employees ADD COLUMN IF NOT EXISTS reporting_to_id INTEGER REFERENCES employees(id) ON DELETE SET NULL'
  );
  await pool.query(
    'ALTER TABLE leaves ADD COLUMN IF NOT EXISTS reporting_to_id INTEGER REFERENCES employees(id) ON DELETE SET NULL'
  );
  employeeColumnsReady = true;
}

module.exports = { ensureEmployeeSchemaColumns };
