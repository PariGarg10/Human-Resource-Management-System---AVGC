/**
 * Run this on a PC in the SAME office network as the ESSL device (not on Vercel).
 * It polls the device and pushes logs to your hosted HRMS API.
 *
 * Usage:
 *   copy .env.example → .env.bridge (or use .env) and set values below
 *   npm run essl:bridge
 */
require('dotenv').config();

const { upsertAttendanceFromDeviceRecords } = require('../utils/deviceAttendance');
const { fetchDeviceAttendanceLogs } = require('../utils/zkDeviceClient');

function envBool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function config() {
  const intervalMs = Number(process.env.ESSL_POLL_INTERVAL_MS || 5 * 60 * 1000);
  return {
    enabled: envBool(process.env.ESSL_ENABLED),
    ip: process.env.ESSL_DEVICE_IP,
    port: Number(process.env.ESSL_DEVICE_PORT || 4370),
    timeout: Number(process.env.ESSL_DEVICE_TIMEOUT_MS || 5000),
    inport: Number(process.env.ESSL_INPORT || 5200),
    intervalMs,
    dayStart: process.env.ESSL_DAY_START || '09:30',
    dayEnd: process.env.ESSL_DAY_END || '23:59',
    lookbackDays: Number(process.env.ESSL_LOOKBACK_DAYS || 14),
    hrmsUrl: (process.env.HRMS_API_URL || process.env.FRONTEND_URL || '').replace(/\/$/, ''),
    apiKey: process.env.BIOMETRIC_API_KEY,
    mode: String(process.env.ESSL_BRIDGE_MODE || 'remote').toLowerCase(),
  };
}

async function fetchDeviceLogs() {
  return fetchDeviceAttendanceLogs();
}

async function pushToCloud(cfg, records) {
  if (!cfg.hrmsUrl) throw new Error('HRMS_API_URL or FRONTEND_URL is required for remote mode');
  if (!cfg.apiKey) throw new Error('BIOMETRIC_API_KEY is required for remote mode');

  const response = await fetch(`${cfg.hrmsUrl}/api/biometric/essl-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
    },
    body: JSON.stringify({ records }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Cloud sync failed (${response.status})`);
  }
  return data;
}

async function runOnce(cfg) {
  console.log(`[essl-bridge] Connecting to device ${cfg.ip}:${cfg.port}…`);
  const records = await fetchDeviceLogs();
  console.log(`[essl-bridge] Fetched ${records.length} raw log(s) from device`);

  if (cfg.mode === 'local') {
    const summary = await upsertAttendanceFromDeviceRecords(records, cfg);
    console.log('[essl-bridge] Local DB sync:', summary);
    return summary;
  }

  const summary = await pushToCloud(cfg, records);
  console.log('[essl-bridge] Pushed to cloud:', summary);
  return summary;
}

async function main() {
  const cfg = config();
  if (!cfg.enabled) {
    console.error('[essl-bridge] Set ESSL_ENABLED=true in .env');
    process.exit(1);
  }
  if (!cfg.ip) {
    console.error('[essl-bridge] Set ESSL_DEVICE_IP in .env');
    process.exit(1);
  }

  console.log(
    `[essl-bridge] Mode=${cfg.mode} interval=${cfg.intervalMs}ms lookback=${cfg.lookbackDays} day(s)`
  );

  const tick = async () => {
    try {
      await runOnce(cfg);
    } catch (err) {
      console.error('[essl-bridge] Sync failed:', err.message);
    }
  };

  await tick();
  setInterval(tick, cfg.intervalMs);
}

main().catch((err) => {
  console.error('[essl-bridge] Fatal:', err.message);
  process.exit(1);
});
