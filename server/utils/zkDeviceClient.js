/**
 * Fetch attendance logs from ESSL/ZKTeco over LAN (TCP 4370).
 * Requires Node running on the same network as the device.
 */

function loadZKLib() {
  const sdk = String(process.env.ESSL_SDK || 'zklib-js').toLowerCase();
  if (sdk === 'node-zklib') {
    return require('node-zklib');
  }
  return require('zklib-js');
}

function envBool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function deviceConfig() {
  return {
    ip: process.env.ESSL_DEVICE_IP,
    port: Number(process.env.ESSL_DEVICE_PORT || 4370),
    timeout: Number(process.env.ESSL_DEVICE_TIMEOUT_MS || 30000),
    inport: Number(process.env.ESSL_INPORT || 4000),
    preferUdp: envBool(process.env.ESSL_PREFER_UDP),
    disableDeviceBeforeRead: envBool(process.env.ESSL_DISABLE_DEVICE),
  };
}

const DEVICE_SETUP_HINT =
  'TCP connects but attendance download failed. On the device: Menu → Comm → disable Comm Password, ' +
  'enable PC connection, set IP/port 4370. Test with ZKTime/eSSL desktop. Try ESSL_PREFER_UDP=true in .env.';

function deviceErrorMessage(err) {
  const msg =
    err?.message ||
    err?.err?.message ||
    (typeof err === 'string' ? err : null) ||
    (err && typeof err === 'object' ? JSON.stringify(err) : String(err || 'Unknown device error'));
  if (/subarray|empty response|TIME OUT|TIMEOUT/i.test(msg)) {
    return DEVICE_SETUP_HINT;
  }
  return msg;
}

async function disconnectZk(zk) {
  try {
    await zk.disconnect();
  } catch (_err) {
    /* ignore */
  }
  if (zk.zklibTcp) zk.zklibTcp.socket = null;
  if (zk.zklibUdp) zk.zklibUdp.socket = null;
  zk.connectionType = null;
}

async function connectUdp(zk) {
  if (!zk.zklibUdp.socket) {
    await zk.zklibUdp.createSocket();
  }
  await zk.zklibUdp.connect();
  zk.connectionType = 'udp';
  console.log('[ESSL] Connected via UDP');
}

async function connectTcp(zk) {
  if (!zk.zklibTcp.socket) {
    await zk.zklibTcp.createSocket();
  }
  await zk.zklibTcp.connect();
  zk.connectionType = 'tcp';
  console.log('[ESSL] Connected via TCP');
}

async function readAttendances(zk, cfg) {
  if (cfg.disableDeviceBeforeRead) {
    try {
      await zk.disableDevice();
    } catch (_err) {
      /* some models do not support this */
    }
  }

  try {
    const result = await zk.getAttendances();
    return result?.data || [];
  } finally {
    if (cfg.disableDeviceBeforeRead) {
      try {
        await zk.enableDevice();
      } catch (_err) {
        /* ignore */
      }
    }
  }
}

async function fetchOnce(zk, cfg, mode) {
  await disconnectZk(zk);
  if (mode === 'udp') {
    await connectUdp(zk);
  } else {
    await connectTcp(zk);
  }
  return readAttendances(zk, cfg);
}

/**
 * @returns {Promise<object[]>} raw zklib attendance rows
 */
async function fetchDeviceAttendanceLogs() {
  const cfg = deviceConfig();
  if (!cfg.ip) {
    throw new Error('ESSL_DEVICE_IP is not set');
  }

  const ZKLib = loadZKLib();
  const zk = new ZKLib(cfg.ip, cfg.port, cfg.timeout, cfg.inport);

  const modes = cfg.preferUdp ? ['udp', 'tcp'] : ['tcp', 'udp'];
  const errors = [];

  try {
    for (const mode of modes) {
      try {
        const logs = await fetchOnce(zk, cfg, mode);
        console.log(`[ESSL] Fetched ${logs.length} attendance record(s) via ${mode.toUpperCase()}`);
        return logs;
      } catch (err) {
        const message = deviceErrorMessage(err);
        errors.push(`${mode}: ${message}`);
        console.warn(`[ESSL] ${mode.toUpperCase()} read failed:`, message);
      }
    }
    throw new Error(errors.join(' | ') || DEVICE_SETUP_HINT);
  } finally {
    await disconnectZk(zk);
  }
}

module.exports = { fetchDeviceAttendanceLogs, deviceConfig, deviceErrorMessage, DEVICE_SETUP_HINT };
