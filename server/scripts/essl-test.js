/**
 * Test TCP connection to ESSL/ZKTeco device (run on office LAN).
 *   npm run essl:test
 */
require('dotenv').config();
const { fetchDeviceAttendanceLogs, deviceConfig } = require('../utils/zkDeviceClient');

async function main() {
  const cfg = deviceConfig();
  if (!cfg.ip) {
    console.error('[essl-test] Set ESSL_DEVICE_IP in .env');
    process.exit(1);
  }

  console.log(
    `[essl-test] Fetching from ${cfg.ip}:${cfg.port} (timeout ${cfg.timeout}ms, inport ${cfg.inport})…`
  );

  try {
    const logs = await fetchDeviceAttendanceLogs();
    console.log(`[essl-test] Attendance logs fetched: ${logs.length}`);
    if (logs.length) {
      console.log('[essl-test] Latest log:', logs[logs.length - 1]);
    }
    console.log('[essl-test] OK — device read works from this laptop.');
  } catch (err) {
    console.error('[essl-test] Failed:', err.message);
    process.exit(1);
  }
}

main();
