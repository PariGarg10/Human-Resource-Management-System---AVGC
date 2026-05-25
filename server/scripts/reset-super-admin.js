/**
 * Reset Super Admin password to SUPER_ADMIN_PASSWORD (default Admin@123).
 * Usage: node server/scripts/reset-super-admin.js
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { replaceAdminPermissions, ALL_MODULES } = require('../utils/adminPermissions');

const email = (process.env.SUPER_ADMIN_EMAIL || 'admin@hrms.com').trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';

(async () => {
  const passwordhash = bcrypt.hashSync(password, 10);

  let admin = await pool.query('SELECT id, employee_id FROM admins WHERE lower(trim(email)) = lower($1)', [email]);
  let employeeId = admin.rows[0]?.employee_id;

  if (!employeeId) {
    const emp = await pool.query(
      "SELECT id FROM employees WHERE lower(trim(email)) = lower($1) AND role = 'admin' LIMIT 1",
      [email]
    );
    employeeId = emp.rows[0]?.id;
  }

  if (employeeId) {
    await pool.query(
      'UPDATE employees SET passwordhash = $1, mustchangepassword = FALSE WHERE id = $2',
      [passwordhash, employeeId]
    );
  }

  if (admin.rows[0]) {
    await pool.query(
      `UPDATE admins SET passwordhash = $1, mustchangepassword = FALSE, is_active = TRUE, is_super_admin = TRUE WHERE id = $2`,
      [passwordhash, admin.rows[0].id]
    );
    await replaceAdminPermissions(pool, admin.rows[0].id, ALL_MODULES);
    console.log(`[reset-super-admin] Updated admin id=${admin.rows[0].id} (${email})`);
  } else {
    console.log(`[reset-super-admin] No admins row for ${email}. Run npm run db:init first.`);
  }

  console.log(`[reset-super-admin] Password set. Login with: ${email} / ${password}`);
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
