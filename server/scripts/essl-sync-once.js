/**
 * One-shot: fetch device logs and write to DATABASE_URL (local dev).
 *   npm run essl:sync
 */
const { loadEsslEnv } = require('./loadEsslEnv');
loadEsslEnv();
const { runEsslAttendanceSync } = require('../jobs/esslAttendanceSync');

async function main() {
  if (!['1', 'true', 'yes', 'on'].includes(String(process.env.ESSL_ENABLED || '').toLowerCase())) {
    console.error('[essl-sync] Set ESSL_ENABLED=true in .env');
    process.exit(1);
  }
  const result = await runEsslAttendanceSync();
  console.log('[essl-sync] Result:', JSON.stringify(result, null, 2));
  if (result.error) process.exit(1);
  if (result.skipped) {
    console.warn('[essl-sync] Skipped:', result.reason);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('[essl-sync] Fatal:', err.message);
    process.exit(1);
  })
  .finally(() => {
    const { pool } = require('../db');
    pool.end().catch(() => {});
  });
