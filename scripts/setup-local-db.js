#!/usr/bin/env node
/**
 * Create local hrms_db and switch .env to USE_LOCAL_DB.
 * Usage: node scripts/setup-local-db.js YOUR_POSTGRES_PASSWORD
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const password = process.argv[2] || process.env.LOCAL_PG_PASSWORD;
if (!password) {
  console.error('Usage: node scripts/setup-local-db.js YOUR_POSTGRES_PASSWORD');
  console.error('  (or set LOCAL_PG_PASSWORD in the environment)');
  process.exit(1);
}

const adminUrl = `postgresql://postgres:${encodeURIComponent(password)}@localhost:5432/postgres`;
const appUrl = `postgresql://postgres:${encodeURIComponent(password)}@localhost:5432/hrms_db`;

async function main() {
  const client = new Client({
    connectionString: adminUrl,
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  const exists = await client.query(`SELECT 1 FROM pg_database WHERE datname = 'hrms_db'`);
  if (!exists.rowCount) {
    await client.query('CREATE DATABASE hrms_db');
    console.log('Created database hrms_db');
  } else {
    console.log('Database hrms_db already exists');
  }
  await client.end();

  const envPath = path.join(__dirname, '..', '.env');
  let env = fs.readFileSync(envPath, 'utf8');
  if (!/^USE_LOCAL_DB=/m.test(env)) {
    env += '\nUSE_LOCAL_DB=true\n';
  } else {
    env = env.replace(/^USE_LOCAL_DB=.*/m, 'USE_LOCAL_DB=true');
  }
  if (!/^LOCAL_DATABASE_URL=/m.test(env)) {
    env += `LOCAL_DATABASE_URL=${appUrl}\n`;
  } else {
    env = env.replace(/^LOCAL_DATABASE_URL=.*/m, `LOCAL_DATABASE_URL=${appUrl}`);
  }
  fs.writeFileSync(envPath, env);
  console.log('Updated .env → USE_LOCAL_DB=true');
  console.log('Run: npm run db:init');
  console.log('Then: npm run dev');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  console.error('Check your PostgreSQL password (user postgres on localhost:5432).');
  process.exit(1);
});
