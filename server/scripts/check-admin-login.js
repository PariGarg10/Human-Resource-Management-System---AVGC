require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../db');

const email = process.argv[2] || 'admin@hrms.com';
const password = process.argv[3] || 'Admin@123';

(async () => {
  const admins = await pool.query(
    'SELECT id, email, is_active, is_super_admin, passwordhash FROM admins WHERE lower(trim(email)) = lower($1)',
    [email]
  );
  const emps = await pool.query(
    'SELECT id, email, role, mustchangepassword, passwordhash FROM employees WHERE lower(trim(email)) = lower($1)',
    [email]
  );
  console.log('admins row:', admins.rows.length ? { ...admins.rows[0], passwordhash: '[hidden]' } : 'NONE');
  console.log('employees row:', emps.rows.length ? { ...emps.rows[0], passwordhash: '[hidden]' } : 'NONE');
  if (admins.rows[0]) {
    console.log('admin password matches:', bcrypt.compareSync(password, admins.rows[0].passwordhash));
  }
  if (emps.rows[0]) {
    console.log('employee password matches:', bcrypt.compareSync(password, emps.rows[0].passwordhash));
  }
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
