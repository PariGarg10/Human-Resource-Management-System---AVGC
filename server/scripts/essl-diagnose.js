/**
 * Raw TCP handshake diagnostic for eSSL/ZKTeco (run on office LAN).
 *   npm run essl:diagnose
 */
require('dotenv').config();
const net = require('net');
const ZKLib = require('node-zklib');
const { COMMANDS } = require('node-zklib/constants');

const ip = process.env.ESSL_DEVICE_IP;
const port = Number(process.env.ESSL_DEVICE_PORT || 4370);
const timeout = Number(process.env.ESSL_DEVICE_TIMEOUT_MS || 30000);
const commKeys = [0, 1, 12345, Number(process.env.ESSL_COMM_KEY || 0)].filter(
  (v, i, a) => Number.isFinite(v) && a.indexOf(v) === i
);

async function rawTcpProbe() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ error: 'TCP timeout — no bytes received on port 4370' });
    }, 5000);

    const chunks = [];
    socket.on('data', (buf) => chunks.push(buf));
    socket.on('error', (err) => {
      clearTimeout(timer);
      resolve({ error: err.message });
    });
    socket.connect(port, ip, () => {
      setTimeout(() => {
        clearTimeout(timer);
        socket.destroy();
        const data = Buffer.concat(chunks);
        resolve({
          bytes: data.length,
          hex: data.length ? data.toString('hex') : '(none)',
        });
      }, 2000);
    });
  });
}

async function tryConnect(commKey) {
  const zk = new ZKLib(ip, port, timeout, 5200, commKey, 'tcp');
  try {
    await zk.zklibTcp.createSocket();
    await zk.zklibTcp.connect();
    await zk.disconnect();
    return { commKey, ok: true };
  } catch (err) {
    return { commKey, ok: false, error: err?.message || String(err) };
  }
}

async function main() {
  if (!ip) {
    console.error('[essl-diagnose] Set ESSL_DEVICE_IP in .env');
    process.exit(1);
  }

  console.log(`[essl-diagnose] Target ${ip}:${port}\n`);

  console.log('[essl-diagnose] 1) Ping / port (run separately):');
  console.log('   ping', ip);
  console.log('   Test-NetConnection', ip, '-Port', port, '\n');

  console.log('[essl-diagnose] 2) Passive TCP listen (2s after connect):');
  const passive = await rawTcpProbe();
  console.log('  ', passive, '\n');

  console.log('[essl-diagnose] 3) ZK CMD_CONNECT with comm keys:', commKeys.join(', '));
  for (const key of commKeys) {
    const result = await tryConnect(key);
    if (result.ok) {
      console.log(`   commKey=${key} → SUCCESS`);
      console.log('\n[essl-diagnose] Set in .env: ESSL_COMM_KEY=' + key);
      console.log('[essl-diagnose] Then: npm run essl:test');
      return;
    }
    console.log(`   commKey=${key} → ${result.error}`);
  }

  console.log('\n[essl-diagnose] All comm keys failed.');
  console.log('[essl-diagnose] Likely causes:');
  console.log('  • eSSL desktop software still connected — quit it fully');
  console.log('  • Wrong device IP (ping works but device is another machine)');
  console.log('  • Device firmware not ZK-compatible — use eSSL software export + Import attendance');
  console.log('  • Comm Key on device is a number not tried above — check Menu → Comm → PC Connection');
  console.log('\n[essl-diagnose] CMD_ACK_OK =', COMMANDS.CMD_ACK_OK, ' CMD_ACK_UNAUTH =', COMMANDS.CMD_ACK_UNAUTH);
}

main().catch((err) => {
  console.error('[essl-diagnose] Fatal:', err.message);
  process.exit(1);
});
