const { format } = require('date-fns');
const { pool } = require('../db');
const { calculateTotalHours, getAttendanceStatus } = require('./attendance');

function parseClock(value, fallback) {
  const raw = String(value || fallback || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return parseClock(fallback || '00:00');
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function clockMinutes(clock) {
  return clock.hour * 60 + clock.minute;
}

function withinWorkWindow(date, startClock, endClock) {
  const minutes = minutesSinceMidnight(date);
  return minutes >= clockMinutes(startClock) && minutes <= clockMinutes(endClock);
}

async function ensureEsslSyncTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS essl_device_logs (
      id SERIAL PRIMARY KEY,
      device_user_id TEXT NOT NULL,
      employeecode TEXT,
      record_time TIMESTAMPTZ NOT NULL,
      device_ip TEXT,
      matched BOOLEAN NOT NULL DEFAULT FALSE,
      createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (device_user_id, record_time)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_essl_device_logs_time ON essl_device_logs (record_time DESC)');
}

function normalizeDeviceRecord(record) {
  const deviceUserId = String(record.deviceUserId || record.userId || record.uid || '').trim();
  const rawTime = record.recordTime || record.attTime || record.timestamp;
  const recordTime = new Date(rawTime);
  if (!deviceUserId || Number.isNaN(recordTime.getTime())) return null;
  return {
    deviceUserId,
    recordTime,
    deviceIp: record.ip || null,
  };
}

async function saveRawDeviceLog(record, employee) {
  await pool.query(
    `
    INSERT INTO essl_device_logs (device_user_id, employeecode, record_time, device_ip, matched)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (device_user_id, record_time)
    DO UPDATE SET employeecode = EXCLUDED.employeecode, device_ip = EXCLUDED.device_ip, matched = EXCLUDED.matched
  `,
    [record.deviceUserId, employee?.employeecode || null, record.recordTime.toISOString(), record.deviceIp, Boolean(employee)]
  );
}

async function upsertAttendanceFromDeviceRecords(rawRecords, options = {}) {
  await ensureEsslSyncTables();
  const startClock = parseClock(options.dayStart, '09:30');
  const endClock = parseClock(options.dayEnd, '23:59');
  const lookbackDays = Number(options.lookbackDays) || 7;
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  since.setHours(0, 0, 0, 0);

  const normalized = rawRecords
    .map(normalizeDeviceRecord)
    .filter((record) => record && record.recordTime >= since && withinWorkWindow(record.recordTime, startClock, endClock))
    .sort((a, b) => a.recordTime.getTime() - b.recordTime.getTime());

  const grouped = new Map();
  const summary = { received: rawRecords.length, usable: normalized.length, matched: 0, skipped: 0, daysUpdated: 0 };

  for (const record of normalized) {
    const employeeResult = await pool.query(
      'SELECT id, employeecode FROM employees WHERE upper(trim(employeecode)) = upper($1) LIMIT 1',
      [record.deviceUserId]
    );
    const employee = employeeResult.rows[0];
    await saveRawDeviceLog(record, employee);
    if (!employee) {
      summary.skipped += 1;
      continue;
    }
    summary.matched += 1;
    const date = format(record.recordTime, 'yyyy-MM-dd');
    const key = `${employee.id}:${date}`;
    if (!grouped.has(key)) grouped.set(key, { employee, date, punches: [] });
    grouped.get(key).punches.push(record.recordTime);
  }

  for (const group of grouped.values()) {
    const punches = group.punches.sort((a, b) => a.getTime() - b.getTime());
    const punchIn = punches[0];
    const punchOut = punches.length > 1 ? punches[punches.length - 1] : null;
    const totalHours = punchOut ? calculateTotalHours(punchIn.toISOString(), punchOut.toISOString()) : null;
    const status = punchOut ? getAttendanceStatus(totalHours) : 'absent';

    await pool.query(
      `
      INSERT INTO attendancelogs (employeeid, date, punchin, punchout, totalhours, status)
      VALUES ($1, $2::date, $3, $4, $5, $6)
      ON CONFLICT (employeeid, date)
      DO UPDATE SET
        punchin = CASE
          WHEN attendancelogs.punchin IS NULL OR EXCLUDED.punchin < attendancelogs.punchin THEN EXCLUDED.punchin
          ELSE attendancelogs.punchin
        END,
        punchout = CASE
          WHEN EXCLUDED.punchout IS NULL THEN attendancelogs.punchout
          WHEN attendancelogs.punchout IS NULL OR EXCLUDED.punchout > attendancelogs.punchout THEN EXCLUDED.punchout
          ELSE attendancelogs.punchout
        END,
        totalhours = CASE
          WHEN EXCLUDED.punchout IS NULL THEN attendancelogs.totalhours
          ELSE EXCLUDED.totalhours
        END,
        status = CASE
          WHEN EXCLUDED.punchout IS NULL THEN attendancelogs.status
          ELSE EXCLUDED.status
        END
    `,
      [
        group.employee.id,
        group.date,
        punchIn.toISOString(),
        punchOut ? punchOut.toISOString() : null,
        totalHours,
        status,
      ]
    );
    summary.daysUpdated += 1;
  }

  return summary;
}

module.exports = { ensureEsslSyncTables, upsertAttendanceFromDeviceRecords };
