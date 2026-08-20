/**
 * Apply pending /migrations/*.sql on server startup (production safety net).
 * Uses the deploy manifest — schema/features + Super Admin only; skips other data migrations.
 * Does not close the DB pool — unlike server/scripts/run-migrations.js CLI.
 */
const { runDeployMigrations } = require('./deployMigrations');

async function applyPendingMigrations() {
  return runDeployMigrations();
}

module.exports = { applyPendingMigrations };
