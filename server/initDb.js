require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { pool } = require('./db');

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
    ['ADMIN001', 'System Admin', 'admin@hrms.com', passwordhash, 'Administration', 'admin', true, true]
  );
  console.log('[db:init] Seeded default admin');
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
