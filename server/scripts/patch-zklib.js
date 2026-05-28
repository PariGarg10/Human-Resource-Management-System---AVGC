/**
 * Harden zklib-js for eSSL devices (empty replies, read timeouts).
 * Re-run after npm install: node server/scripts/patch-zklib.js
 */
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '../../node_modules/zklib-js/zklibtcp.js');
if (!fs.existsSync(target)) {
  console.log('[patch-zklib] zklib-js not installed, skip');
  process.exit(0);
}

let src = fs.readFileSync(target, 'utf8');
let changed = false;

const emptyGuardBefore = `      } catch (err) {
        reject(err)
        console.log(reply)

      }
      
      const header = decodeTCPHeader(reply.subarray(0, 16))`;

const emptyGuardAfter = `      } catch (err) {
        reject(err)
        return
      }

      if (!reply || reply.length < 16) {
        reject(new Error('Device returned empty response (check comm password / PC link settings)'))
        return
      }
      
      const header = decodeTCPHeader(reply.subarray(0, 16))`;

if (!src.includes('Device returned empty response')) {
  if (src.includes(emptyGuardBefore)) {
    src = src.replace(emptyGuardBefore, emptyGuardAfter);
    changed = true;
  }
}

const attendBefore = `    try {
      data = await this.readWithBuffer(REQUEST_DATA.GET_ATTENDANCE_LOGS, callbackInProcess)
    } catch (err) {
      return Promise.reject(err)
    }

    if (this.socket) {
      try {
        await this.freeData()
      } catch (err) {
        return Promise.reject(err)
      }
    }


    const RECORD_PACKET_SIZE = 40

    let recordData = data.data.subarray(4)`;

const attendAfter = `    try {
      data = await this.readWithBuffer(REQUEST_DATA.GET_ATTENDANCE_LOGS, callbackInProcess)
    } catch (err) {
      return Promise.reject(err)
    }

    if (data?.err) {
      return Promise.reject(data.err)
    }
    if (!data?.data || data.data.length < 4) {
      return Promise.reject(new Error('Device returned no attendance buffer'))
    }

    if (this.socket) {
      try {
        await this.freeData()
      } catch (err) {
        return Promise.reject(err)
      }
    }


    const RECORD_PACKET_SIZE = 40

    let recordData = data.data.subarray(4)`;

if (!src.includes('Device returned no attendance buffer') && src.includes(attendBefore)) {
  src = src.replace(attendBefore, attendAfter);
  changed = true;
}

if (changed) {
  fs.writeFileSync(target, src);
  console.log('[patch-zklib] Patches applied');
} else if (src.includes('Device returned empty response') && src.includes('Device returned no attendance buffer')) {
  console.log('[patch-zklib] Already patched');
} else {
  console.warn('[patch-zklib] Some patches were not applied — check zklib-js version');
}
