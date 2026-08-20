/**
 * Production-safe migrations: schema/features + Super Admin only.
 * Skips data migrations that would alter other production records.
 *
 * Usage: npm run db:migrate:deploy
 */
require('dotenv').config();
const { pool } = require('../db');
const { runDeployMigrations } = require('../utils/deployMigrations');

async function main() {
  const { applied, skipped } = await runDeployMigrations();

  if (!applied.length && !skipped.length) {
    console.log('[db:migrate:deploy] No pending migrations.');
  } else {
    console.log('[db:migrate:deploy] Done.');
    if (applied.length) console.log(`  Applied: ${applied.join(', ')}`);
    if (skipped.length) console.log(`  Skipped: ${skipped.join(', ')}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[db:migrate:deploy] Failed:', err.message);
  process.exit(1);
});
