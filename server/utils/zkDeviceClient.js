/**
 * Fetch attendance logs from ESSL/ZKTeco over LAN (TCP 4370).
 * Requires Node running on the same network as the device.
 */

function envBool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function deviceConfig() {
  const commKeyRaw = process.env.ESSL_COMM_KEY;
  const commKey =
    commKeyRaw === undefined || commKeyRaw === '' ? 0 : Number.parseInt(String(commKeyRaw), 10);
  return {
    ip: process.env.ESSL_DEVICE_IP,
    port: Number(process.env.ESSL_DEVICE_PORT || 4370),
    timeout: Number(process.env.ESSL_DEVICE_TIMEOUT_MS || 30000),
    inport: Number(process.env.ESSL_INPORT || 5200),
    preferUdp: envBool(process.env.ESSL_PREFER_UDP),
    tcpOnly: envBool(process.env.ESSL_TCP_ONLY),
    disableDeviceBeforeRead: envBool(process.env.ESSL_DISABLE_DEVICE),
    commKey: Number.isFinite(commKey) ? commKey : 0,
    sdk: String(process.env.ESSL_SDK || 'node-zklib').toLowerCase(),
  };
}

function deviceErrorMessage(err) {
  const msg =
    err?.message ||
    err?.err?.message ||
    (typeof err === 'string' ? err : null) ||
    (err && typeof err === 'object' ? JSON.stringify(err) : String(err || 'Unknown device error'));

  if (/AUTH_FAILED|CMD_ACK_UNAUTH|UNAUTH/i.test(msg)) {
    return (
      'Device requires a Comm Key (comm password). On device: Menu → Comm → PC Connection → note the numeric key. ' +
      'Set ESSL_COMM_KEY=that_number in .env and run essl:test again.'
    );
  }
  if (/EADDRINUSE/i.test(msg)) {
    return (
      `UDP port ${process.env.ESSL_INPORT || 5200} is already in use. ` +
      'Stop npm start / essl:bridge or set ESSL_TCP_ONLY=true in .env.'
    );
  }
  if (/ENETUNREACH|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(msg)) {
    return (
      'Cannot reach the device on the network. Join office Wi‑Fi, confirm device IP, ' +
      'and run: Test-NetConnection <device-ip> -Port 4370'
    );
  }
  if (/ERR_OUT_OF_RANGE|offset.*out of range/i.test(msg)) {
    return (
      'Device accepted connection but rejected data commands — usually wrong Comm Key. ' +
      'Set ESSL_COMM_KEY on device menu (0 if disabled) in .env, or try ESSL_SDK=node-zklib.'
    );
  }
  if (/TIMEOUT_ON_WRITING|TIMEOUT_ON_RECEIVING|TIMEOUT_IN_RECEIVING|TIME OUT/i.test(msg)) {
    return (
      'Device connected but did not send attendance data (timeout). Close eSSL/ZKTime software, ' +
      'power-cycle the device, set ESSL_TCP_ONLY=true and ESSL_DISABLE_DEVICE=true, then retry.'
    );
  }
  if (/empty response|no attendance buffer|subarray/i.test(msg)) {
    return (
      'Device connected but returned no attendance data. Close eSSL desktop, power-cycle device, retry.'
    );
  }
  if (/UNHANDLE_CMD/i.test(msg)) {
    return 'Device firmware may not match this SDK. Share device model if eSSL desktop can download logs.';
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

function unwrapZkError(err) {
  if (err?.err) return err.err;
  return err;
}

async function fetchWithNodeZklib(cfg) {
  const ZKLib = require('node-zklib');
  const protocol = cfg.tcpOnly || !cfg.preferUdp ? 'tcp' : null;
  const zk = new ZKLib(cfg.ip, cfg.port, cfg.timeout, cfg.inport, cfg.commKey, protocol);

  try {
    await zk.createSocket();
    console.log(`[ESSL] Connected via ${String(zk.connectionType || 'tcp').toUpperCase()}`);

    if (cfg.disableDeviceBeforeRead) {
      try {
        await zk.disableDevice();
      } catch (_err) {
        /* some models do not support this */
      }
    }

    const result = await zk.getAttendances();
    if (result?.err) {
      throw unwrapZkError(result.err);
    }
    return result?.data || [];
  } finally {
    if (cfg.disableDeviceBeforeRead) {
      try {
        await zk.enableDevice();
      } catch (_err) {
        /* ignore */
      }
    }
    await disconnectZk(zk);
  }
}

async function connectTcpLegacy(zk) {
  if (!zk.zklibTcp.socket) {
    await zk.zklibTcp.createSocket();
  }
  await zk.zklibTcp.connect();
  zk.connectionType = 'tcp';
  console.log('[ESSL] Connected via TCP');
}

async function connectUdpLegacy(zk) {
  if (!zk.zklibUdp.socket) {
    await zk.zklibUdp.createSocket();
  }
  await zk.zklibUdp.connect();
  zk.connectionType = 'udp';
  console.log('[ESSL] Connected via UDP');
}

async function readAttendancesLegacy(zk, cfg) {
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

async function fetchOnceLegacy(zk, cfg, mode) {
  await disconnectZk(zk);
  if (mode === 'udp') {
    await connectUdpLegacy(zk);
  } else {
    await connectTcpLegacy(zk);
  }
  return readAttendancesLegacy(zk, cfg);
}

async function fetchWithZklibJs(cfg) {
  const ZKLib = require('zklib-js');
  const zk = new ZKLib(cfg.ip, cfg.port, cfg.timeout, cfg.inport);
  const modes = cfg.tcpOnly ? ['tcp'] : cfg.preferUdp ? ['udp', 'tcp'] : ['tcp', 'udp'];
  const errors = [];

  try {
    for (const mode of modes) {
      try {
        const logs = await fetchOnceLegacy(zk, cfg, mode);
        console.log(`[ESSL] Fetched ${logs.length} attendance record(s) via ${mode.toUpperCase()}`);
        return logs;
      } catch (err) {
        const message = deviceErrorMessage(unwrapZkError(err));
        errors.push(`${mode}: ${message}`);
        console.warn(`[ESSL] ${mode.toUpperCase()} read failed:`, message);
      }
    }
    throw new Error(errors.join(' | ') || 'Device attendance download failed');
  } finally {
    await disconnectZk(zk);
  }
}

/**
 * @returns {Promise<object[]>} raw zklib attendance rows
 */
async function fetchDeviceAttendanceLogs() {
  const cfg = deviceConfig();
  if (!cfg.ip) {
    throw new Error('ESSL_DEVICE_IP is not set');
  }

  if (cfg.sdk === 'node-zklib') {
    const logs = await fetchWithNodeZklib(cfg);
    console.log(`[ESSL] Fetched ${logs.length} attendance record(s)`);
    return logs;
  }

  return fetchWithZklibJs(cfg);
}

async function probeDeviceConnection() {
  const cfg = deviceConfig();
  if (!cfg.ip) {
    throw new Error('ESSL_DEVICE_IP is not set');
  }

  const lines = [];
  if (cfg.sdk === 'node-zklib') {
    const ZKLib = require('node-zklib');
    const zk = new ZKLib(cfg.ip, cfg.port, cfg.timeout, cfg.inport, cfg.commKey, 'tcp');
    try {
      await zk.createSocket();
      lines.push(`TCP connect: OK (comm key ${cfg.commKey})`);
      try {
        const info = await zk.getInfo();
        lines.push(`Users on device: ${info.userCounts}, attendance logs: ${info.logCounts}`);
      } catch (err) {
        lines.push(`Device info: ${deviceErrorMessage(unwrapZkError(err))}`);
      }
      try {
        const time = await zk.getTime();
        lines.push(`Device time: ${time.toISOString()}`);
      } catch (err) {
        lines.push(`Device time: ${deviceErrorMessage(unwrapZkError(err))}`);
      }
    } catch (err) {
      lines.push(`TCP connect: ${deviceErrorMessage(unwrapZkError(err))}`);
    } finally {
      await disconnectZk(zk);
    }
    return lines;
  }

  const ZKLib = require('zklib-js');
  const zk = new ZKLib(cfg.ip, cfg.port, cfg.timeout, cfg.inport);
  try {
    await connectTcpLegacy(zk);
    lines.push('TCP connect: OK (legacy zklib-js — consider ESSL_SDK=node-zklib)');
    try {
      const size = await zk.zklibTcp.getAttendanceSize();
      lines.push(`Attendance records on device: ${size}`);
    } catch (err) {
      lines.push(`Attendance size: ${deviceErrorMessage(err)}`);
    }
  } catch (err) {
    lines.push(`TCP connect: ${deviceErrorMessage(err)}`);
  } finally {
    await disconnectZk(zk);
  }
  return lines;
}

module.exports = {
  fetchDeviceAttendanceLogs,
  deviceConfig,
  deviceErrorMessage,
  probeDeviceConnection,
};
