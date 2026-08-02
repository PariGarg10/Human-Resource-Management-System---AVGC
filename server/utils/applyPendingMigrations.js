/**
 * Apply pending /migrations/*.sql on server startup (production safety net).
 * Does not close the DB pool — unlike server/scripts/run-migrations.js CLI.
 */
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

async function applyPendingMigrations() {
  await ensureMigrationsTable();
  const applied = await getAppliedFilenames();
  const pending = listMigrationFiles().filter((f) => !applied.has(f));
  if (!pending.length) return { applied: [] };

  const done = [];
  for (const filename of pending) {
    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      done.push(filename);
      console.log(`[db:migrate] Applied ${filename}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${filename}: ${err.message}`);
    } finally {
      client.release();
    }
  }
  return { applied: done };
}

module.exports = { applyPendingMigrations };
