const { pool } = require('../db');

function normalizeEmployeeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function isValidEmployeeCode(code) {
  return /^[A-Z0-9_-]+$/.test(code);
}

async function generateEmployeeCode() {
  const { rows } = await pool.query(
    "SELECT employeecode FROM employees WHERE employeecode LIKE 'EMP%'"
  );

  let maxNumber = 0;
  for (const row of rows) {
    const code = String(row.employeecode || '');
    const num = Number(code.replace(/^EMP/, ''));
    if (!Number.isNaN(num) && num > maxNumber) {
      maxNumber = num;
    }
  }

  return `EMP${String(maxNumber + 1).padStart(3, '0')}`;
}

module.exports = { generateEmployeeCode, normalizeEmployeeCode, isValidEmployeeCode };
