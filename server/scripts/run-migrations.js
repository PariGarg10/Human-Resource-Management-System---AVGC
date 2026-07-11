/**
 * Apply SQL files from /migrations in filename order.
 * Tracks applied files in schema_migrations.
 *
 * Usage: npm run db:migrate
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

const migrationsDir = path.join(__dirname, '..', '..', 'migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedFilenames() {
  const { rows } = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  return new Set(rows.map((r) => r.filename));
}

function listMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

async function applyMigration(filename) {
  const filePath = path.join(migrationsDir, filename);
  const sql = fs.readFileSync(filePath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
    console.log(`[db:migrate] Applied ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`${filename}: ${err.message}`);
  } finally {
    client.release();
  }
}

async function main() {
  await ensureMigrationsTable();
  const applied = await getAppliedFilenames();
  const files = listMigrationFiles();
  const pending = files.filter((f) => !applied.has(f));

  if (!pending.length) {
    console.log('[db:migrate] No pending migrations.');
    await pool.end();
    return;
  }

  console.log(`[db:migrate] Pending: ${pending.join(', ')}`);
  for (const filename of pending) {
    await applyMigration(filename);
  }
  console.log('[db:migrate] Done.');
  await pool.end();
}

main().catch((err) => {
  console.error('[db:migrate] Failed:', err.message);
  process.exit(1);
});
