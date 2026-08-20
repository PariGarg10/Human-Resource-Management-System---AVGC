/**
 * Reset Super Admin password to SUPER_ADMIN_PASSWORD (default Admin@123).
 * Usage: node server/scripts/reset-super-admin.js
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { replaceAdminPermissions, ALL_MODULES } = require('../utils/adminPermissions');
const { generateEmployeeCode } = require('../utils/employeeCode');
const {
  SUPER_ADMIN_NAME,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
  SUPER_ADMIN_DESIGNATION,
  SUPER_ADMIN_DEPARTMENT,
  SUPER_ADMIN_EMPLOYEE_CODE,
} = require('../constants/superAdmin');

const email = SUPER_ADMIN_EMAIL;
const password = SUPER_ADMIN_PASSWORD;

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
    const empCode =
      SUPER_ADMIN_EMPLOYEE_CODE ||
      (await pool.query('SELECT employeecode FROM employees WHERE id = $1', [employeeId])).rows[0]
        ?.employeecode ||
      (await generateEmployeeCode(pool, SUPER_ADMIN_DEPARTMENT));
    await pool.query(
      `
        UPDATE employees
        SET employeecode = $1,
            name = $2,
            email = $3,
            designation = $4,
            passwordhash = $5,
            mustchangepassword = FALSE
        WHERE id = $6
      `,
      [empCode, SUPER_ADMIN_NAME, email, SUPER_ADMIN_DESIGNATION, passwordhash, employeeId]
    );
  }

  if (admin.rows[0]) {
    await pool.query(
      `
        UPDATE admins
        SET name = $1,
            email = $2,
            designation = $3,
            passwordhash = $4,
            mustchangepassword = FALSE,
            is_active = TRUE,
            is_super_admin = TRUE
        WHERE id = $5
      `,
      [SUPER_ADMIN_NAME, email, SUPER_ADMIN_DESIGNATION, passwordhash, admin.rows[0].id]
    );
    await replaceAdminPermissions(pool, admin.rows[0].id, ALL_MODULES);
    console.log(`[reset-super-admin] Updated admin id=${admin.rows[0].id} (${email})`);
  } else {
    console.log(`[reset-super-admin] No admins row for ${email}. Run npm run db:init first.`);
  }

  console.log(`[reset-super-admin] Password set. Login with: ${email} / ${password} (${SUPER_ADMIN_NAME})`);
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
