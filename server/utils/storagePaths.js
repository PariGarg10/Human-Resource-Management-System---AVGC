const path = require('path');
const fs = require('fs');

function safeEnsureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.warn('[storage] Could not create directory:', dir, err.message);
    }
  }
}

/** Writable upload root (uses /tmp on Vercel serverless). */
function getUploadsRoot(subdir = '') {
  const base = process.env.VERCEL
    ? path.join('/tmp', 'avgc-uploads')
    : path.join(__dirname, '..', '..', 'uploads');
  const dir = subdir ? path.join(base, subdir) : base;
  safeEnsureDir(dir);
  return dir;
}

/** Static public assets (HTML, CSS, JS). */
function getPublicDir() {
  if (process.env.VERCEL) {
    return path.join(process.cwd(), 'public');
  }
  return path.join(__dirname, '..', '..', 'public');
}

module.exports = { safeEnsureDir, getUploadsRoot, getPublicDir };
