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
  await pool.query(
    'ALTER TABLE essl_device_logs ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_essl_device_logs_imported ON essl_device_logs (imported_at) WHERE imported_at IS NULL'
  );
}

async function upsertAttendanceDayGroup(group) {
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
}

async function markEsslLogsImported(logIds) {
  if (!logIds?.length) return;
  await pool.query('UPDATE essl_device_logs SET imported_at = NOW() WHERE id = ANY($1::int[])', [logIds]);
}

function normalizeDeviceRecord(record) {
  const deviceUserId = String(
    record.deviceUserId || record.userId || record.uid || record.employeecode || record.enrollNumber || ''
  ).trim();
  const deviceName = String(record.name || record.userName || record.employeeName || '').trim();
  const rawTime = record.recordTime || record.attTime || record.timestamp || record.time;
  const recordTime = new Date(rawTime);
  if ((!deviceUserId && !deviceName) || Number.isNaN(recordTime.getTime())) return null;
  return {
    deviceUserId: deviceUserId || deviceName,
    deviceName: deviceName || null,
    recordTime,
    deviceIp: record.ip || null,
  };
}

/** Match device user id or display name to HRMS employee (code first, then name). */
async function findEmployeeByDeviceIdentity(deviceUserId, deviceName) {
  const code = String(deviceUserId || '').trim();
  const name = String(deviceName || '').trim();

  if (code) {
    const exact = await pool.query(
      `
      SELECT id, employeecode, name
      FROM employees
      WHERE upper(trim(employeecode)) = upper($1)
         OR trim(employeecode) = trim($2)
      LIMIT 1
    `,
      [code, code.replace(/^0+/, '') || code]
    );
    if (exact.rows[0]) return exact.rows[0];
  }

  if (name) {
    const byName = await pool.query(
      `
      SELECT id, employeecode, name
      FROM employees
      WHERE lower(trim(name)) = lower($1)
      LIMIT 1
    `,
      [name]
    );
    if (byName.rows[0]) return byName.rows[0];
  }

  if (code) {
    const stripped = code.replace(/^0+/, '') || code;
    const numeric = await pool.query(
      `
      SELECT id, employeecode, name
      FROM employees
      WHERE ltrim(trim(employeecode), '0') = $1
         OR ltrim(trim(employeecode), '0') = $2
      LIMIT 1
    `,
      [stripped, code.replace(/^0+/, '')]
    );
    if (numeric.rows[0]) return numeric.rows[0];
  }

  return null;
}

async function saveRawDeviceLog(record, employee) {
  const result = await pool.query(
    `
    INSERT INTO essl_device_logs (device_user_id, employeecode, record_time, device_ip, matched)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (device_user_id, record_time)
    DO UPDATE SET employeecode = EXCLUDED.employeecode, device_ip = EXCLUDED.device_ip, matched = EXCLUDED.matched
    RETURNING id
  `,
    [record.deviceUserId, employee?.employeecode || null, record.recordTime.toISOString(), record.deviceIp, Boolean(employee)]
  );
  return result.rows[0]?.id;
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
  const logIdsByKey = new Map();
  const summary = { received: rawRecords.length, usable: normalized.length, matched: 0, skipped: 0, daysUpdated: 0, punchesImported: 0 };

  const employeeCache = new Map();

  for (const record of normalized) {
    const cacheKey = `${record.deviceUserId}|${record.deviceName || ''}`;
    let employee = employeeCache.get(cacheKey);
    if (employee === undefined) {
      employee = await findEmployeeByDeviceIdentity(record.deviceUserId, record.deviceName);
      employeeCache.set(cacheKey, employee || null);
    }
    const logId = await saveRawDeviceLog(record, employee);
    if (!employee) {
      summary.skipped += 1;
      continue;
    }
    summary.matched += 1;
    const date = format(record.recordTime, 'yyyy-MM-dd');
    const key = `${employee.id}:${date}`;
    if (!grouped.has(key)) {
      grouped.set(key, { employee, date, punches: [] });
      logIdsByKey.set(key, []);
    }
    grouped.get(key).punches.push(record.recordTime);
    if (logId) logIdsByKey.get(key).push(logId);
  }

  for (const [key, group] of grouped.entries()) {
    await upsertAttendanceDayGroup(group);
    const ids = logIdsByKey.get(key) || [];
    await markEsslLogsImported(ids);
    summary.punchesImported += ids.length;
    summary.daysUpdated += 1;
  }

  return summary;
}

async function listEsslDeviceLogs({ from, to, matched, imported, limit = 500 }) {
  await ensureEsslSyncTables();
  const clauses = ['l.record_time::date >= $1::date', 'l.record_time::date <= $2::date'];
  const params = [from, to];
  let idx = 3;

  if (matched === 'true') {
    clauses.push('l.matched = TRUE');
  } else if (matched === 'false') {
    clauses.push('l.matched = FALSE');
  }
  if (imported === 'true') {
    clauses.push('l.imported_at IS NOT NULL');
  } else if (imported === 'false') {
    clauses.push('l.imported_at IS NULL');
  }

  const result = await pool.query(
    `
    SELECT
      l.id,
      l.device_user_id,
      l.employeecode,
      l.record_time,
      l.device_ip,
      l.matched,
      l.imported_at,
      e.id AS employee_id,
      e.name AS employee_name
    FROM essl_device_logs l
    LEFT JOIN employees e ON upper(trim(e.employeecode)) = upper(trim(COALESCE(l.employeecode, l.device_user_id)))
    WHERE ${clauses.join(' AND ')}
    ORDER BY l.record_time DESC
    LIMIT $${idx}
  `,
    [...params, Math.min(Math.max(Number(limit) || 500, 1), 2000)]
  );

  const stats = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE matched)::int AS matched,
      COUNT(*) FILTER (WHERE imported_at IS NOT NULL)::int AS imported,
      COUNT(*) FILTER (WHERE matched AND imported_at IS NULL)::int AS pending_import
    FROM essl_device_logs l
    WHERE ${clauses.join(' AND ')}
  `,
    params
  );

  return {
    logs: result.rows.map((row) => ({
      id: row.id,
      deviceUserId: row.device_user_id,
      employeecode: row.employeecode,
      recordTime: row.record_time,
      deviceIp: row.device_ip,
      matched: row.matched,
      importedAt: row.imported_at,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
    })),
    stats: stats.rows[0],
  };
}

async function importEsslLogsToAttendance(options = {}) {
  await ensureEsslSyncTables();
  const startClock = parseClock(options.dayStart, process.env.ESSL_DAY_START || '09:30');
  const endClock = parseClock(options.dayEnd, process.env.ESSL_DAY_END || '23:59');
  const from = options.from;
  const to = options.to;
  const onlyPending = options.onlyPending !== false;
  const summary = { logsProcessed: 0, matched: 0, skipped: 0, daysUpdated: 0, punchesImported: 0 };

  if (!from || !to) {
    throw new Error('from and to dates (YYYY-MM-DD) are required');
  }

  let query = `
    SELECT id, device_user_id, employeecode, record_time, matched
    FROM essl_device_logs
    WHERE record_time::date >= $1::date AND record_time::date <= $2::date
  `;
  const params = [from, to];
  if (onlyPending) {
    query += ' AND imported_at IS NULL';
  }
  query += ' ORDER BY record_time ASC';

  const { rows } = await pool.query(query, params);
  const grouped = new Map();
  const logIdsByKey = new Map();
  const employeeCache = new Map();

  for (const row of rows) {
    summary.logsProcessed += 1;
    const recordTime = new Date(row.record_time);
    if (Number.isNaN(recordTime.getTime()) || !withinWorkWindow(recordTime, startClock, endClock)) {
      summary.skipped += 1;
      continue;
    }

    const cacheKey = `${row.device_user_id}|${row.employeecode || ''}`;
    let employee = employeeCache.get(cacheKey);
    if (employee === undefined) {
      if (row.employeecode) {
        const byCode = await pool.query(
          'SELECT id, employeecode, name FROM employees WHERE upper(trim(employeecode)) = upper($1) LIMIT 1',
          [row.employeecode]
        );
        employee = byCode.rows[0] || null;
      }
      if (!employee) {
        employee = await findEmployeeByDeviceIdentity(row.device_user_id, null);
      }
      employeeCache.set(cacheKey, employee || null);
    }

    if (!employee) {
      summary.skipped += 1;
      continue;
    }

    summary.matched += 1;
    const date = format(recordTime, 'yyyy-MM-dd');
    const key = `${employee.id}:${date}`;
    if (!grouped.has(key)) {
      grouped.set(key, { employee, date, punches: [] });
      logIdsByKey.set(key, []);
    }
    grouped.get(key).punches.push(recordTime);
    logIdsByKey.get(key).push(row.id);
  }

  for (const [key, group] of grouped.entries()) {
    await upsertAttendanceDayGroup(group);
    const ids = logIdsByKey.get(key) || [];
    await markEsslLogsImported(ids);
    summary.punchesImported += ids.length;
    summary.daysUpdated += 1;
  }

  return summary;
}

module.exports = {
  ensureEsslSyncTables,
  upsertAttendanceFromDeviceRecords,
  findEmployeeByDeviceIdentity,
  listEsslDeviceLogs,
  importEsslLogsToAttendance,
};
