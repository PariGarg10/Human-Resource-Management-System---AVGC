const { db } = require('../db');

function generateEmployeeCode() {
  const rows = db
    .prepare("SELECT employeecode FROM employees WHERE employeecode LIKE 'EMP%'")
    .all();

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

module.exports = { generateEmployeeCode };
