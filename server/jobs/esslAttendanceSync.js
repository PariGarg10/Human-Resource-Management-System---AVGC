const { upsertAttendanceFromDeviceRecords } = require('../utils/deviceAttendance');
const { fetchDeviceAttendanceLogs } = require('../utils/zkDeviceClient');

let syncRunning = false;
let timer = null;

function envBool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function config() {
  return {
    enabled: envBool(process.env.ESSL_ENABLED),
    ip: process.env.ESSL_DEVICE_IP,
    port: Number(process.env.ESSL_DEVICE_PORT || 4370),
    timeout: Number(process.env.ESSL_DEVICE_TIMEOUT_MS || 10000),
    inport: Number(process.env.ESSL_INPORT || 5200),
    intervalMs: Number(process.env.ESSL_POLL_INTERVAL_MS || 5 * 60 * 1000),
    dayStart: process.env.ESSL_DAY_START || '09:30',
    dayEnd: process.env.ESSL_DAY_END || '23:59',
    lookbackDays: Number(process.env.ESSL_LOOKBACK_DAYS || 14),
  };
}

async function fetchDeviceLogs() {
  return fetchDeviceAttendanceLogs();
}

async function runEsslAttendanceSync() {
  const cfg = config();
  if (!cfg.enabled) return { skipped: true, reason: 'ESSL sync disabled' };
  if (!cfg.ip) return { skipped: true, reason: 'ESSL_DEVICE_IP missing' };
  if (syncRunning) return { skipped: true, reason: 'ESSL sync already running' };

  syncRunning = true;
  try {
    const records = await fetchDeviceLogs();
    const summary = await upsertAttendanceFromDeviceRecords(records, cfg);
    console.log(
      `[ESSL] Synced ${summary.daysUpdated} employee day(s). Received=${summary.received}, matched=${summary.matched}, skipped=${summary.skipped}`
    );
    return summary;
  } catch (err) {
    console.error('[ESSL] Attendance sync failed:', err.message);
    return { error: err.message };
  } finally {
    syncRunning = false;
  }
}

function startEsslAttendanceSync() {
  const cfg = config();
  if (!cfg.enabled) {
    console.log('[ESSL] Attendance sync disabled. Set ESSL_ENABLED=true to start polling.');
    return;
  }
  if (!cfg.ip) {
    console.warn('[ESSL] ESSL_ENABLED=true but ESSL_DEVICE_IP is missing.');
    return;
  }

  runEsslAttendanceSync().catch(() => {});
  timer = setInterval(() => {
    runEsslAttendanceSync().catch(() => {});
  }, cfg.intervalMs);
  console.log(`[ESSL] Attendance sync enabled for ${cfg.ip}:${cfg.port} every ${cfg.intervalMs}ms`);
}

module.exports = { startEsslAttendanceSync, runEsslAttendanceSync };
