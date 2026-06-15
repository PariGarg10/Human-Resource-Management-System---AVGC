/**
 * Root postinstall: patch zklib, optionally install dashboard deps (skipped on Railway).
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '../..');
execSync('node server/scripts/patch-zklib.js', { cwd: root, stdio: 'inherit' });

if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) {
  console.log('[postinstall] Railway detected — skipping dashboard npm install (use pre-built public/ assets).');
  process.exit(0);
}

console.log('[postinstall] Installing dashboard dependencies…');
execSync('npm run install:dashboard', { cwd: root, stdio: 'inherit' });
