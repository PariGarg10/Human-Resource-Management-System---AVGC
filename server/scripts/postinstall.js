/**
 * Root postinstall: patch zklib, optionally install dashboard deps (skipped if client/ folder isn't present, e.g. on Beanstalk/Railway).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
execSync('node server/scripts/patch-zklib.js', { cwd: root, stdio: 'inherit' });

const dashboardPath = path.join(root, 'client/avgc-dashboard');

if (!fs.existsSync(dashboardPath)) {
  console.log('[postinstall] client/avgc-dashboard not found — skipping dashboard npm install (expected on Beanstalk/Railway, use pre-built public/ assets).');
  process.exit(0);
}

console.log('[postinstall] Installing dashboard dependencies…');
execSync('npm run install:dashboard', { cwd: root, stdio: 'inherit' });