/**
 * Test connection to eSSL SQL Server and read latest punch.
 * Usage: npm run essl:sql:test
 */
require('dotenv').config();
const { testSqlServerConnection, tableConfig } = require('../utils/esslSqlServer');

(async () => {
  try {
    console.log('[essl-sql-test] Tables:', tableConfig());
    const result = await testSqlServerConnection();
    console.log('[essl-sql-test] OK — latest punch sample:', result.sample);
  } catch (err) {
    console.error('[essl-sql-test] Failed:', err.message);
    process.exit(1);
  }
})();
