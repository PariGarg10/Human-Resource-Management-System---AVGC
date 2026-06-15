/**
 * Inlines app-bundle.css @imports into a single file (one HTTP request vs 16+).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssDir = path.resolve(__dirname, '../public/css');
const entry = path.join(cssDir, 'app-bundle.css');
const out = path.join(cssDir, 'app-bundle.built.css');

const source = fs.readFileSync(entry, 'utf8');
const importRe = /@import\s+url\("([^"]+)"\)\s*;/g;
const tail = source.replace(importRe, '').trim();

let bundled = '/* AVGC portal CSS — bundled for faster load */\n';
let match;
while ((match = importRe.exec(source)) !== null) {
  const file = match[1];
  const filePath = path.join(cssDir, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`[bundle-portal-css] missing: ${file}`);
    continue;
  }
  bundled += `\n/* --- ${file} --- */\n`;
  bundled += fs.readFileSync(filePath, 'utf8');
  bundled += '\n';
}

if (tail) {
  bundled += `\n/* --- app-bundle tail --- */\n${tail}\n`;
}

fs.writeFileSync(out, bundled);
console.log(`[bundle-portal-css] wrote ${out} (${(bundled.length / 1024).toFixed(1)} KB)`);
