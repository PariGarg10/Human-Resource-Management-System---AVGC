/**
 * After Vite build: hash bundled JS and stamp dashboard HTML with ?v= for cache busting.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const assetsDir = path.join(publicDir, 'assets', 'avgc-dashboard');

function fileHash(filePath) {
  if (!fs.existsSync(filePath)) return Date.now().toString(36);
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

const employeeApp = path.join(assetsDir, 'employee-app.js');
const teamHub = path.join(assetsDir, 'team-hub.js');
const version = fileHash(employeeApp);

const versionPayload = {
  v: version,
  builtAt: new Date().toISOString(),
  employeeApp: `/assets/avgc-dashboard/employee-app.js?v=${version}`,
  teamHub: `/assets/avgc-dashboard/team-hub.js?v=${fileHash(teamHub)}`,
};

fs.writeFileSync(path.join(publicDir, 'asset-version.json'), `${JSON.stringify(versionPayload, null, 2)}\n`);

const htmlFiles = [
  'employee-dashboard.html',
  'manager-dashboard.html',
  'admin-dashboard.html',
];

const localAssetRe = /((?:href|src)=["'])(\/(?:css|assets|js)\/[^"'?]+)(["'])/g;

for (const name of htmlFiles) {
  const filePath = path.join(publicDir, name);
  if (!fs.existsSync(filePath)) continue;
  let html = fs.readFileSync(filePath, 'utf8');
  html = html.replace(localAssetRe, (_match, prefix, url, suffix) => {
    if (url.includes('?v=')) return `${prefix}${url}${suffix}`;
    return `${prefix}${url}?v=${version}${suffix}`;
  });
  fs.writeFileSync(filePath, html);
  console.log(`[stamp-dashboard-assets] ${name} → v=${version}`);
}

console.log(`[stamp-dashboard-assets] asset-version.json v=${version}`);
