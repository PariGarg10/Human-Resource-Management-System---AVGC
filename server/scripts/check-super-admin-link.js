require('dotenv').config();
const { pool } = require('../db');

(async () => {
  const { rows } = await pool.query(
    `SELECT a.id, a.email, a.employee_id, a.is_super_admin, e.id AS emp_id, e.role, e.employeecode
     FROM admins a
     LEFT JOIN employees e ON e.id = a.employee_id
     WHERE a.is_super_admin = TRUE
     LIMIT 5`
  );
  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
