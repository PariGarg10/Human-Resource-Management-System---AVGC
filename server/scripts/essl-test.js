/**
 * Test TCP connection to ESSL/ZKTeco device (run on office LAN).
 *   npm run essl:test
 *
 * Before running: stop npm start / essl:bridge, close eSSL desktop software.
 */
require('dotenv').config();
const {
  fetchDeviceAttendanceLogs,
  deviceConfig,
  deviceErrorMessage,
  probeDeviceConnection,
} = require('../utils/zkDeviceClient');

async function main() {
  const cfg = deviceConfig();
  if (!cfg.ip) {
    console.error('[essl-test] Set ESSL_DEVICE_IP in .env');
    process.exit(1);
  }

  console.log(
    `[essl-test] Device ${cfg.ip}:${cfg.port} sdk=${cfg.sdk} commKey=${cfg.commKey} ` +
      `(timeout ${cfg.timeout}ms, inport ${cfg.inport}, tcpOnly=${cfg.tcpOnly}, disable=${cfg.disableDeviceBeforeRead})`
  );
  console.log('[essl-test] Tip: stop npm start / essl:bridge and close eSSL desktop before testing.\n');

  const probe = await probeDeviceConnection();
  probe.forEach((line) => console.log(`[essl-test] ${line}`));
  console.log('');

  try {
    const logs = await fetchDeviceAttendanceLogs();
    console.log(`[essl-test] Attendance logs fetched: ${logs.length}`);
    if (logs.length) {
      console.log('[essl-test] Latest log:', logs[logs.length - 1]);
    }
    console.log('[essl-test] OK — device read works from this laptop.');
  } catch (err) {
    console.error('[essl-test] Failed:', deviceErrorMessage(err.err || err));
    process.exit(1);
  }
}

main();
