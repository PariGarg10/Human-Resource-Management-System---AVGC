const { upsertAttendanceFromDeviceRecords } = require('../utils/deviceAttendance');
const {
  getLastSqlSyncTime,
  setLastSqlSyncTime,
  fetchPunchesSince,
} = require('../utils/esslSqlServer');

let syncRunning = false;
let timer = null;

function envBool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function config() {
  return {
    enabled: envBool(process.env.ESSL_SQL_ENABLED),
    intervalMs: Number(process.env.ESSL_SQL_POLL_INTERVAL_MS || process.env.ESSL_POLL_INTERVAL_MS || 5 * 60 * 1000),
    dayStart: process.env.ESSL_DAY_START || '09:30',
    dayEnd: process.env.ESSL_DAY_END || '23:59',
    lookbackDays: Number(process.env.ESSL_SQL_LOOKBACK_DAYS || process.env.ESSL_LOOKBACK_DAYS || 14),
  };
}

async function runEsslSqlServerSync() {
  const cfg = config();
  if (!cfg.enabled) return { skipped: true, reason: 'ESSL SQL sync disabled' };
  if (syncRunning) return { skipped: true, reason: 'ESSL SQL sync already running' };

  syncRunning = true;
  try {
    let since = await getLastSqlSyncTime();
    const epoch = since.getTime() <= 0;
    if (epoch) {
      since = new Date();
      since.setDate(since.getDate() - cfg.lookbackDays);
      since.setHours(0, 0, 0, 0);
    }

    const { records, maxTime, rowCount } = await fetchPunchesSince(since);
    const summary = await upsertAttendanceFromDeviceRecords(records, cfg);

    if (rowCount > 0 && maxTime > since) {
      await setLastSqlSyncTime(maxTime);
    } else if (epoch) {
      await setLastSqlSyncTime(new Date());
    }

    console.log(
      `[ESSL-SQL] Synced ${summary.daysUpdated} employee day(s). SQL rows=${rowCount}, received=${summary.received}, matched=${summary.matched}, skipped=${summary.skipped}`
    );

    return { ...summary, sqlRows: rowCount, since: since.toISOString(), cursor: maxTime.toISOString() };
  } catch (err) {
    console.error('[ESSL-SQL] Attendance sync failed:', err.message);
    return { error: err.message };
  } finally {
    syncRunning = false;
  }
}

function startEsslSqlServerSync() {
  const cfg = config();
  if (!cfg.enabled) {
    console.log('[ESSL-SQL] SQL Server sync disabled. Set ESSL_SQL_ENABLED=true on AWS.');
    return;
  }

  runEsslSqlServerSync().catch(() => {});
  timer = setInterval(() => {
    runEsslSqlServerSync().catch(() => {});
  }, cfg.intervalMs);

  console.log(`[ESSL-SQL] SQL Server attendance sync enabled every ${cfg.intervalMs}ms`);
}

module.exports = { startEsslSqlServerSync, runEsslSqlServerSync };
