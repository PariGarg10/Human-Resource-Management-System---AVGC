require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { pool } = require('./db');
const { replaceAdminPermissions, ALL_MODULES } = require('./utils/adminPermissions');
const { generateEmployeeCode } = require('./utils/employeeCode');
const { ensureEsslSyncTables } = require('./utils/deviceAttendance');

async function runSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  await pool.query(`
    DELETE FROM holidays h
    USING holidays older
    WHERE h.date = older.date
      AND h.id > older.id
  `);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_unique_date ON holidays (date)');
  await pool.query('ALTER TABLE concerns ADD COLUMN IF NOT EXISTS responseattachmenturl TEXT');
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS temp_password_hash TEXT');
  await pool.query(
    'ALTER TABLE employees ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT FALSE'
  );
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS temp_password_expiry TIMESTAMPTZ');
  await pool.query(
    'ALTER TABLE employees ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0'
  );
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_locked_until TIMESTAMPTZ');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      user_type TEXT NOT NULL CHECK (user_type IN ('admin', 'manager', 'employee')),
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens (token_hash)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_password_reset_email_created ON password_reset_tokens (lower(email), created_at)'
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS holidays (
      id SERIAL PRIMARY KEY,
      holiday_name TEXT NOT NULL,
      date DATE NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('national', 'festival', 'optional')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (date)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays (date)');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_unique_date ON holidays (date)');
  await ensureEsslSyncTables();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_attendance_records (
      id SERIAL PRIMARY KEY,
      importid INTEGER NOT NULL REFERENCES importhistory(id) ON DELETE CASCADE,
      employeeid INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (importid, employeeid, date)
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_import_attendance_records_import ON import_attendance_records (importid)'
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS asset_allocations (
      id SERIAL PRIMARY KEY,
      inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS policy_documents (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL CHECK (type IN ('policy', 'link')),
      file_url TEXT,
      external_url TEXT,
      uploaded_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation TEXT');
  await pool.query(
    'ALTER TABLE employees ADD COLUMN IF NOT EXISTS reporting_to_id INTEGER REFERENCES employees(id) ON DELETE SET NULL'
  );
  await pool.query(
    'ALTER TABLE leaves ADD COLUMN IF NOT EXISTS reporting_to_id INTEGER REFERENCES employees(id) ON DELETE SET NULL'
  );
  console.log('[db:init] Schema applied from server/schema.sql');
}

async function seedDemoEmployee() {
  const existing = await pool.query('SELECT id FROM employees WHERE employeecode = $1', ['EMP001']);
  if (existing.rows.length > 0) return;

  const passwordhash = bcrypt.hashSync('password123', 10);
  await pool.query(
    `
    INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `,
    ['EMP001', 'Demo Employee', 'emp001@example.com', passwordhash, 'Engineering', 'employee', true, false]
  );
  console.log('[db:init] Seeded demo employee EMP001');
}

async function seedDefaultAdmin() {
  const existing = await pool.query(
    "SELECT id FROM employees WHERE email = $1 AND role = 'admin'",
    ['admin@hrms.com']
  );
  if (existing.rows.length > 0) return;

  const passwordhash = bcrypt.hashSync('Admin@123', 10);
  await pool.query(
    `
    INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `,
    ['ADMIN001', 'System Admin', 'admin@hrms.com', passwordhash, 'Administration', 'admin', true, false]
  );
  console.log('[db:init] Seeded default admin');
}

async function seedSuperAdmin() {
  const email = (process.env.SUPER_ADMIN_EMAIL || 'admin@hrms.com').trim();
  const password = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';
  const passwordhash = bcrypt.hashSync(password, 10);

  let employee = await pool.query(
    "SELECT id, name, email, department FROM employees WHERE lower(trim(email)) = lower($1) AND role = 'admin' LIMIT 1",
    [email]
  );
  let employeeId = employee.rows[0]?.id;

  if (!employeeId) {
    const code = await generateEmployeeCode();
    const insert = await pool.query(
      `
        INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
        VALUES ($1, $2, $3, $4, $5, 'admin', TRUE, FALSE)
        RETURNING id
      `,
      [code, 'Super Admin', email, passwordhash, 'Administration', 'admin']
    );
    employeeId = insert.rows[0].id;
  } else {
    await pool.query(
      'UPDATE employees SET passwordhash = $1, mustchangepassword = FALSE WHERE id = $2',
      [passwordhash, employeeId]
    );
  }

  const adminInsert = await pool.query(
    `
      INSERT INTO admins (name, email, passwordhash, designation, department, is_super_admin, is_active, mustchangepassword, employee_id)
      VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, FALSE, $6)
      ON CONFLICT (email) DO UPDATE SET
        is_super_admin = TRUE,
        is_active = TRUE,
        mustchangepassword = FALSE,
        passwordhash = EXCLUDED.passwordhash,
        employee_id = COALESCE(admins.employee_id, EXCLUDED.employee_id)
      RETURNING id
    `,
    ['Super Admin', email, passwordhash, 'Super Administrator', 'Administration', employeeId]
  );
  const adminId = adminInsert.rows[0].id;
  await replaceAdminPermissions(pool, adminId, ALL_MODULES);
  console.log(`[db:init] Super Admin ready (${email}) — password synced from env/default`);
}

async function seedSampleManagers() {
  const samples = [
    { code: 'EMP900', name: 'Manager One', email: 'manager1@gmail.com', department: 'HR' },
    { code: 'EMP901', name: 'Manager Two', email: 'manager2@gmail.com', department: 'Development' },
  ];

  for (const sample of samples) {
    const existing = await pool.query(
      "SELECT id FROM employees WHERE email = $1 AND role = 'manager'",
      [sample.email]
    );
    if (existing.rows.length > 0) continue;

    const passwordhash = bcrypt.hashSync('Manager@123', 10);
    await pool.query(
      `
      INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
      VALUES ($1, $2, $3, $4, $5, 'manager', $6, $7)
    `,
      [sample.code, sample.name, sample.email, passwordhash, sample.department, true, false]
    );
    console.log(`[db:init] Seeded manager ${sample.email}`);
  }
}

async function main() {
  try {
    await runSchema();
    await seedDemoEmployee();
    await seedDefaultAdmin();
    await seedSuperAdmin();
    await seedSampleManagers();
    console.log('[db:init] Database initialization complete');
  } catch (err) {
    console.error('[db:init] Failed:', err.message);
    console.error('[db:init] Full error:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
