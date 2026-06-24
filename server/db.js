require('dotenv').config();
const { Pool } = require('pg');

function resolveConnectionString() {
  if (process.env.USE_LOCAL_DB === 'true' && process.env.LOCAL_DATABASE_URL) {
    return process.env.LOCAL_DATABASE_URL;
  }
  return process.env.DATABASE_URL;
}

const connectionString = resolveConnectionString();
const useSsl =
  connectionString &&
  /neon\.tech|sslmode=require|sslmode=verify|amazonaws\.com|supabase|railway\.app|rlwy\.net/i.test(
    connectionString
  );

const connectionTimeoutMillis = Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 30000);

const pool = new Pool({
  connectionString,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  max: process.env.VERCEL ? 2 : 10,
  idleTimeoutMillis: process.env.VERCEL ? 10000 : 30000,
  connectionTimeoutMillis,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

let dbUnavailableUntil = 0;

function databaseHostLabel() {
  if (!connectionString) return 'not configured';
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || 5432}`;
  } catch {
    return 'invalid DATABASE_URL';
  }
}

if (!connectionString && process.env.VERCEL) {
  console.warn('[PostgreSQL] DATABASE_URL is not set — API routes that use the database will fail.');
}

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected pool error:', err.message);
});

function isTransientDbError(err) {
  const message = String(err?.message || '');
  return /timeout|timed out|ETIMEDOUT|ECONNREFUSED|terminated|ENOTFOUND|EHOSTUNREACH/i.test(message);
}

async function query(text, params) {
  if (Date.now() < dbUnavailableUntil) {
    const err = new Error(
      `Database unavailable (${databaseHostLabel()}). Retry in ${Math.ceil((dbUnavailableUntil - Date.now()) / 1000)}s.`
    );
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (isTransientDbError(err)) {
      dbUnavailableUntil = Date.now() + 30000;
    }
    throw err;
  }
}

async function verifyConnection() {
  if (!connectionString) {
    return { ok: false, message: 'DATABASE_URL is not set' };
  }
  const started = Date.now();
  try {
    await pool.query('SELECT 1');
    dbUnavailableUntil = 0;
    return { ok: true, host: databaseHostLabel(), ms: Date.now() - started };
  } catch (err) {
    if (isTransientDbError(err)) {
      dbUnavailableUntil = Date.now() + 30000;
    }
    return {
      ok: false,
      host: databaseHostLabel(),
      message: err.message,
      ms: Date.now() - started,
    };
  }
}

async function warmPool() {
  const result = await verifyConnection();
  if (result.ok) {
    console.log(`[PostgreSQL] Connection pool warmed (${result.host}, ${result.ms}ms)`);
    return;
  }
  console.error(`[PostgreSQL] Pool warmup failed (${result.host}, ${result.ms}ms): ${result.message}`);
  console.error(
    '[PostgreSQL] Fix: connect to office VPN, allow your IP in the AWS RDS security group, or set USE_LOCAL_DB=true with LOCAL_DATABASE_URL in .env then run npm run db:init'
  );
}

function isDbCachedUnavailable() {
  return Date.now() < dbUnavailableUntil;
}

module.exports = {
  pool,
  query,
  warmPool,
  verifyConnection,
  databaseHostLabel,
  isTransientDbError,
  isDbCachedUnavailable,
};
