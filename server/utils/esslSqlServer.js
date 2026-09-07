/**
 * Read punch logs from eSSL / ZKTeco SQL Server (CHECKINOUT + USERINFO) and map to HRMS device records.
 */
const sql = require('mssql');
const { pool } = require('../db');

function envBool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function safeIdent(name, fallback) {
  const n = String(name || fallback).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) {
    throw new Error(`Invalid SQL identifier: ${n}`);
  }
  return n;
}

function sqlServerConfig() {
  const connectionString = String(process.env.ESSL_SQL_CONNECTION_STRING || '').trim();
  if (connectionString) {
    return { connectionString };
  }

  const server = String(process.env.ESSL_SQL_SERVER || '').trim();
  const database = String(process.env.ESSL_SQL_DATABASE || '').trim();
  const user = String(process.env.ESSL_SQL_USER || '').trim();
  const password = process.env.ESSL_SQL_PASSWORD ?? '';

  if (!server || !database || !user) {
    throw new Error('Set ESSL_SQL_SERVER, ESSL_SQL_DATABASE, ESSL_SQL_USER (and ESSL_SQL_PASSWORD) or ESSL_SQL_CONNECTION_STRING');
  }

  const port = Number(process.env.ESSL_SQL_PORT || 1433);
  const encrypt = envBool(process.env.ESSL_SQL_ENCRYPT ?? 'true');
  const trustServerCertificate = envBool(process.env.ESSL_SQL_TRUST_CERT ?? 'true');

  return {
    server,
    port,
    database,
    user,
    password,
    options: {
      encrypt,
      trustServerCertificate,
      enableArithAbort: true,
    },
    connectionTimeout: Number(process.env.ESSL_SQL_CONNECT_TIMEOUT_MS || 30000),
    requestTimeout: Number(process.env.ESSL_SQL_REQUEST_TIMEOUT_MS || 120000),
  };
}

function tableConfig() {
  return {
    checkinoutTable: safeIdent(process.env.ESSL_SQL_CHECKINOUT_TABLE, 'CHECKINOUT'),
    userinfoTable: safeIdent(process.env.ESSL_SQL_USERINFO_TABLE, 'USERINFO'),
    userIdColumn: safeIdent(process.env.ESSL_SQL_USER_ID_COLUMN, 'UserId'),
    checkTimeColumn: safeIdent(process.env.ESSL_SQL_CHECK_TIME_COLUMN, 'CheckTime'),
    badgeColumn: safeIdent(process.env.ESSL_SQL_BADGE_COLUMN, 'Badgenumber'),
    nameColumn: safeIdent(process.env.ESSL_SQL_NAME_COLUMN, 'Name'),
  };
}

async function ensureEsslSqlSyncStateTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS essl_sql_sync_state (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      last_check_time TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01'::timestamptz,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    INSERT INTO essl_sql_sync_state (id, last_check_time)
    VALUES (1, '1970-01-01'::timestamptz)
    ON CONFLICT (id) DO NOTHING
  `);
}

async function getLastSqlSyncTime() {
  await ensureEsslSqlSyncStateTable();
  const { rows } = await pool.query('SELECT last_check_time FROM essl_sql_sync_state WHERE id = 1');
  return rows[0]?.last_check_time ? new Date(rows[0].last_check_time) : new Date(0);
}

async function setLastSqlSyncTime(when) {
  await ensureEsslSqlSyncStateTable();
  const ts = when instanceof Date && !Number.isNaN(when.getTime()) ? when : new Date();
  await pool.query(
    `UPDATE essl_sql_sync_state SET last_check_time = $1, updated_at = NOW() WHERE id = 1`,
    [ts.toISOString()]
  );
}

function stringifyBadge(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  return String(value).trim().replace(/\.0+$/, '');
}

function mapRowToDeviceRecord(row) {
  const badge = stringifyBadge(row.Badgenumber ?? row.badgenumber ?? row.employeecode);
  const name = String(row.Name ?? row.name ?? '').trim();
  const checkTime = row.CheckTime ?? row.checktime ?? row.recordTime;
  const recordTime = checkTime instanceof Date ? checkTime : new Date(checkTime);
  if ((!badge && !name) || Number.isNaN(recordTime.getTime())) return null;

  return {
    deviceUserId: badge || name,
    employeecode: badge || undefined,
    name: name || undefined,
    recordTime: recordTime.toISOString(),
  };
}

async function fetchPunchesSince(sinceDate) {
  const cfg = tableConfig();
  const since = sinceDate instanceof Date ? sinceDate : new Date(sinceDate);
  if (Number.isNaN(since.getTime())) throw new Error('Invalid since date for SQL sync');

  const poolConn = await sql.connect(sqlServerConfig());
  try {
    const request = poolConn.request();
    request.input('since', sql.DateTime2, since);

    const query = `
      SELECT
        u.[${cfg.badgeColumn}] AS Badgenumber,
        u.[${cfg.nameColumn}] AS Name,
        c.[${cfg.checkTimeColumn}] AS CheckTime
      FROM [${cfg.checkinoutTable}] c
      INNER JOIN [${cfg.userinfoTable}] u ON c.[${cfg.userIdColumn}] = u.[${cfg.userIdColumn}]
      WHERE c.[${cfg.checkTimeColumn}] >= @since
      ORDER BY c.[${cfg.checkTimeColumn}] ASC
    `;

    const result = await request.query(query);
    const rows = result.recordset || [];
    const records = [];
    let maxTime = since;

    for (const row of rows) {
      const mapped = mapRowToDeviceRecord(row);
      if (!mapped) continue;
      records.push(mapped);
      const t = new Date(mapped.recordTime);
      if (t > maxTime) maxTime = t;
    }

    return { records, maxTime, rowCount: rows.length };
  } finally {
    await poolConn.close();
  }
}

async function testSqlServerConnection() {
  const poolConn = await sql.connect(sqlServerConfig());
  try {
    const cfg = tableConfig();
    const result = await poolConn.request().query(`
      SELECT TOP 1
        u.[${cfg.badgeColumn}] AS Badgenumber,
        c.[${cfg.checkTimeColumn}] AS CheckTime
      FROM [${cfg.checkinoutTable}] c
      INNER JOIN [${cfg.userinfoTable}] u ON c.[${cfg.userIdColumn}] = u.[${cfg.userIdColumn}]
      ORDER BY c.[${cfg.checkTimeColumn}] DESC
    `);
    return {
      ok: true,
      sample: result.recordset?.[0] || null,
    };
  } finally {
    await poolConn.close();
  }
}

module.exports = {
  sqlServerConfig,
  tableConfig,
  ensureEsslSqlSyncStateTable,
  getLastSqlSyncTime,
  setLastSqlSyncTime,
  fetchPunchesSince,
  testSqlServerConnection,
  mapRowToDeviceRecord,
};
