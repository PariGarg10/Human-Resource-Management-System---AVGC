/**
 * Apply pending migrations using the production deploy manifest.
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const { classifyDeployMigration } = require('./migrationManifest');

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

async function markMigrationApplied(client, filename) {
  await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
}

async function applySqlMigration(filename) {
  const filePath = path.join(migrationsDir, filename);
  const sql = fs.readFileSync(filePath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await markMigrationApplied(client, filename);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`${filename}: ${err.message}`);
  } finally {
    client.release();
  }
}

async function skipMigration(filename) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await markMigrationApplied(client, filename);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`${filename}: ${err.message}`);
  } finally {
    client.release();
  }
}

/**
 * @returns {{ applied: string[], skipped: string[] }}
 */
async function runDeployMigrations() {
  await ensureMigrationsTable();
  const applied = await getAppliedFilenames();
  const pending = listMigrationFiles().filter((f) => !applied.has(f));

  const appliedNow = [];
  const skippedNow = [];

  for (const filename of pending) {
    const action = classifyDeployMigration(filename);
    if (action === 'unknown') {
      throw new Error(
        `Migration "${filename}" is not listed in server/utils/migrationManifest.js. ` +
          'Add it to DEPLOY_APPLY (schema/features/super-admin) or DEPLOY_SKIP (prod data to avoid).'
      );
    }

    if (action === 'skip') {
      await skipMigration(filename);
      skippedNow.push(filename);
      console.log(`[db:migrate:deploy] Skipped (marked applied): ${filename}`);
      continue;
    }

    await applySqlMigration(filename);
    appliedNow.push(filename);
    console.log(`[db:migrate:deploy] Applied ${filename}`);
  }

  return { applied: appliedNow, skipped: skippedNow };
}

module.exports = { runDeployMigrations };
