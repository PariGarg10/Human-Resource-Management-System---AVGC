/**
 * Wipe employees, admins, and manager assignments — keep a single Super Admin.
 *
 * Usage:
 *   CONFIRM_RESET=yes npm run db:reset-org
 *
 * Optional env:
 *   SUPER_ADMIN_EMAIL    (default: admin@hrms.com)
 *   SUPER_ADMIN_PASSWORD (default: Admin@123)
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { replaceAdminPermissions, ALL_MODULES } = require('../utils/adminPermissions');
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
const dryRun = process.argv.includes('--dry-run');

async function countRows(db, table) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
  return rows[0]?.c || 0;
}

async function resolveSuperAdmin(db) {
  const byFlag = await db.query(
    `
      SELECT id, employee_id, email
      FROM admins
      WHERE is_super_admin = TRUE AND is_active = TRUE
      ORDER BY id
      LIMIT 1
    `
  );
  if (byFlag.rows[0]) return byFlag.rows[0];

  const byEmail = await db.query(
    `
      SELECT id, employee_id, email
      FROM admins
      WHERE lower(trim(email)) = lower($1)
      ORDER BY id
      LIMIT 1
    `,
    [email]
  );
  return byEmail.rows[0] || null;
}

async function ensureSuperAdminEmployee(db, existingEmployeeId) {
  const passwordhash = bcrypt.hashSync(password, 10);

  if (existingEmployeeId) {
    await db.query(
      `
        UPDATE employees
        SET employeecode = $2,
            name = $3,
            email = $4,
            passwordhash = $5,
            department = COALESCE(NULLIF(trim(department), ''), $6),
            designation = $7,
            role = 'admin',
            isregistered = TRUE,
            is_active = TRUE,
            employment_status = 'active',
            mustchangepassword = FALSE,
            force_password_change = FALSE,
            temp_password_hash = NULL,
            temp_password_expiry = NULL,
            failed_login_attempts = 0,
            account_locked_until = NULL,
            reporting_to_id = NULL,
            onboarding_completed = TRUE,
            is_first_login = FALSE
        WHERE id = $1
      `,
      [existingEmployeeId, SUPER_ADMIN_EMPLOYEE_CODE, SUPER_ADMIN_NAME, email, passwordhash, SUPER_ADMIN_DEPARTMENT, SUPER_ADMIN_DESIGNATION]
    );
    return existingEmployeeId;
  }

  const insert = await db.query(
    `
      INSERT INTO employees (
        employeecode, name, email, passwordhash, department, designation, role,
        isregistered, is_active, employment_status, mustchangepassword,
        onboarding_completed, is_first_login
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'admin', TRUE, TRUE, 'active', FALSE, TRUE, FALSE)
      RETURNING id
    `,
    [SUPER_ADMIN_EMPLOYEE_CODE, SUPER_ADMIN_NAME, email, passwordhash, SUPER_ADMIN_DEPARTMENT, SUPER_ADMIN_DESIGNATION]
  );
  return insert.rows[0].id;
}

async function ensureSuperAdminRow(db, employeeId, existingAdminId) {
  const passwordhash = bcrypt.hashSync(password, 10);

  if (existingAdminId) {
    await db.query(
      `
        UPDATE admins
        SET name = $2,
            email = $3,
            passwordhash = $4,
            designation = $5,
            department = $6,
            is_super_admin = TRUE,
            is_active = TRUE,
            mustchangepassword = FALSE,
            employee_id = $7
        WHERE id = $1
      `,
      [
        existingAdminId,
        SUPER_ADMIN_NAME,
        email,
        passwordhash,
        SUPER_ADMIN_DESIGNATION,
        SUPER_ADMIN_DEPARTMENT,
        employeeId,
      ]
    );
    await replaceAdminPermissions(db, existingAdminId, ALL_MODULES);
    return existingAdminId;
  }

  const insert = await db.query(
    `
      INSERT INTO admins (
        name, email, passwordhash, designation, department,
        is_super_admin, is_active, mustchangepassword, employee_id
      )
      VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, FALSE, $6)
      RETURNING id
    `,
    [SUPER_ADMIN_NAME, email, passwordhash, SUPER_ADMIN_DESIGNATION, SUPER_ADMIN_DEPARTMENT, employeeId]
  );
  const adminId = insert.rows[0].id;
  await replaceAdminPermissions(db, adminId, ALL_MODULES);
  return adminId;
}

async function clearOrgData(db, keepEmployeeId, keepAdminId) {
  await db.query('DELETE FROM manageremployees');
  await db.query('DELETE FROM password_reset_tokens');
  await db.query('DELETE FROM saturday_config');
  await db.query('UPDATE employees SET reporting_to_id = NULL');

  if (keepAdminId) {
    await db.query('DELETE FROM admins WHERE id <> $1', [keepAdminId]);
  } else {
    await db.query('DELETE FROM admins');
  }

  await db.query('DELETE FROM employees WHERE id <> $1', [keepEmployeeId]);
}

async function main() {
  if (process.env.CONFIRM_RESET !== 'yes') {
    console.error('[reset-org] Refusing to run without CONFIRM_RESET=yes');
    console.error('[reset-org] Preview only: npm run db:reset-org -- --dry-run');
    process.exit(1);
  }

  const before = {
    employees: await countRows(pool, 'employees'),
    admins: await countRows(pool, 'admins'),
    managerAssignments: await countRows(pool, 'manageremployees'),
  };

  console.log('[reset-org] Before:', before);
  if (dryRun) {
    console.log('[reset-org] Dry run — no changes written.');
    console.log(`[reset-org] Would keep Super Admin: ${email}`);
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await resolveSuperAdmin(client);
    let employeeId = existing?.employee_id || null;
    let adminId = existing?.id || null;

    employeeId = await ensureSuperAdminEmployee(client, employeeId);
    adminId = await ensureSuperAdminRow(client, employeeId, adminId);
    await clearOrgData(client, employeeId, adminId);

    await client.query('COMMIT');

    const after = {
      employees: await countRows(pool, 'employees'),
      admins: await countRows(pool, 'admins'),
      managerAssignments: await countRows(pool, 'manageremployees'),
    };

    console.log('[reset-org] After:', after);
    console.log(`[reset-org] Super Admin ready. Login: ${SUPER_ADMIN_NAME} — ${email} / ${password}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[reset-org] Failed:', err.message);
  process.exit(1);
});
