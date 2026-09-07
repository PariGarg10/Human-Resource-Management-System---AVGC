/**
 * One-shot SQL Server → PostgreSQL attendance sync.
 * Usage: npm run essl:sql-sync
 */
require('dotenv').config();
const { pool } = require('../db');
const { runEsslSqlServerSync } = require('../jobs/esslSqlServerSync');

(async () => {
  try {
    if (!['1', 'true', 'yes', 'on'].includes(String(process.env.ESSL_SQL_ENABLED || '').toLowerCase())) {
      process.env.ESSL_SQL_ENABLED = 'true';
    }
    const summary = await runEsslSqlServerSync();
    console.log('[essl-sql-sync]', summary);
  } catch (err) {
    console.error('[essl-sql-sync] Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
