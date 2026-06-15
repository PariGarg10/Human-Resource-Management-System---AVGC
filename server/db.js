require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const useSsl =
  connectionString &&
  /neon\.tech|sslmode=require|sslmode=verify|amazonaws\.com|supabase|railway\.app|rlwy\.net/i.test(
    connectionString
  );

const pool = new Pool({
  connectionString,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  max: process.env.VERCEL ? 2 : 10,
  idleTimeoutMillis: process.env.VERCEL ? 10000 : 30000,
  connectionTimeoutMillis: process.env.VERCEL ? 10000 : 15000,
});

if (!connectionString && process.env.VERCEL) {
  console.warn('[PostgreSQL] DATABASE_URL is not set — API routes that use the database will fail.');
}

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected pool error:', err.message);
});

async function warmPool() {
  if (!connectionString) return;
  try {
    await pool.query('SELECT 1');
    console.log('[PostgreSQL] Connection pool warmed');
  } catch (err) {
    console.warn('[PostgreSQL] Pool warmup failed:', err.message);
  }
}

module.exports = { pool, warmPool };