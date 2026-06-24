#!/usr/bin/env node
require('dotenv').config();
const { verifyConnection, databaseHostLabel } = require('../server/db');

(async () => {
  console.log('Checking database at', databaseHostLabel(), '...');
  const result = await verifyConnection();
  if (result.ok) {
    console.log(`OK — connected in ${result.ms}ms`);
    process.exit(0);
  }
  console.error(`FAILED — ${result.message}`);
  console.error('');
  console.error('Your app cannot log in until the database is reachable.');
  console.error('Options:');
  console.error('  1. Connect to office VPN (if RDS is private).');
  console.error('  2. AWS Console → RDS → Security group → Inbound → PostgreSQL 5432 → your public IP.');
  console.error('  3. Local PostgreSQL: set in .env');
  console.error('       USE_LOCAL_DB=true');
  console.error('       LOCAL_DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/hrms_db');
  console.error('     then run: npm run db:init');
  console.error('  4. For local dev without the biometric device: ESSL_ENABLED=false');
  process.exit(1);
})();
