require('dotenv').config();
const { pool } = require('../db');
const { ensurePayrollSchema } = require('../utils/payrollSchema');
const { getSalaryStructure } = require('../utils/payrollCompute');

(async () => {
  try {
    await ensurePayrollSchema();
    const r = await pool.query('SELECT id FROM employees LIMIT 1');
    if (!r.rows[0]) {
      console.log('no employees');
      return;
    }
    const id = r.rows[0].id;
    const salary = await getSalaryStructure(id);
    console.log('salary ok', salary);
    const payslips = await pool.query(
      `SELECT pi.*, pr.period_month, pr.period_year, pr.status AS run_status
       FROM payroll_items pi
       JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
       WHERE pi.employee_id = $1 AND pr.status = 'finalized'
       ORDER BY pr.period_year DESC, pr.period_month DESC LIMIT 24`,
      [id]
    );
    console.log('payslips', payslips.rows.length);
    const tax = await pool.query(
      'SELECT * FROM tax_declarations WHERE employee_id = $1 ORDER BY submitted_at DESC LIMIT 1',
      [id]
    );
    console.log('tax ok', tax.rows.length);
  } catch (e) {
    console.error('ERR', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
})();
