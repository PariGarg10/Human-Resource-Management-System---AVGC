require('dotenv').config();
const { pool } = require('../db');
const { ensurePayrollSchema } = require('../utils/payrollSchema');
const { computeEmployeePayroll } = require('../utils/payrollCompute');

(async () => {
  try {
    await ensurePayrollSchema();
    const r = await pool.query('SELECT id FROM employees LIMIT 1');
    const id = r.rows[0]?.id;
    if (!id) return;
    const m = new Date().getMonth() + 1;
    const y = new Date().getFullYear();
    const calc = await computeEmployeePayroll(id, m, y);
    console.log('compute ok', calc.netPay);
  } catch (e) {
    console.error('ERR', e.message, e.stack);
  } finally {
    await pool.end();
  }
})();
