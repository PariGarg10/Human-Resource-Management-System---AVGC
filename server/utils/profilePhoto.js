const fs = require('fs');
const path = require('path');
const { getPublicDir, getUploadsRoot, safeEnsureDir } = require('./storagePaths');

/** Writable directory for profile photo uploads (never write under read-only public/ on Vercel). */
function getProfilePhotoUploadDir() {
  if (process.env.VERCEL) {
    return getUploadsRoot('profile-photos');
  }
  const dir = path.join(getPublicDir(), 'uploads', 'profile-photos');
  safeEnsureDir(dir);
  return dir;
}

function extractProfilePhotoFilename(urlOrName) {
  if (!urlOrName) return null;
  const raw = String(urlOrName).trim();
  if (!raw) return null;
  const withoutQuery = raw.split('?')[0];
  const base = path.basename(withoutQuery);
  if (!base || base === '.' || base === '..') return null;
  return base;
}

/** Resolve a stored profile photo URL or filename to an on-disk path. */
function resolveProfilePhotoPath(urlOrFilename) {
  const filename = extractProfilePhotoFilename(urlOrFilename);
  if (!filename) return null;

  const candidates = [
    path.join(getProfilePhotoUploadDir(), filename),
    path.join(getUploadsRoot('profile-photos'), filename),
    path.join(getPublicDir(), 'uploads', 'profile-photos', filename),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch (_e) {
      /* try next */
    }
  }
  return null;
}

/** Browser-safe URL (static file, no Authorization header required for <img>). */
function profilePhotoPublicUrl(filename) {
  const safe = extractProfilePhotoFilename(filename);
  if (!safe) return null;
  return `/uploads/profile-photos/${safe}`;
}

/** Normalize stored values from the database. */
function normalizeProfilePhotoUrl(stored) {
  if (!stored) return null;
  const value = String(stored).trim();
  if (!value) return null;
  if (value === '/api/users/profile-photo/me') return value;
  const filename = extractProfilePhotoFilename(value);
  if (filename) return profilePhotoPublicUrl(filename);
  return value.startsWith('/') ? value : `/${value}`;
}

/** Copy legacy uploads into public/uploads so static serving finds them. */
function migrateProfilePhotosToPublic() {
  const legacyDir = getUploadsRoot('profile-photos');
  const publicDir = getProfilePhotoUploadDir();
  let names = [];
  try {
    names = fs.readdirSync(legacyDir);
  } catch (_e) {
    return;
  }
  for (const name of names) {
    if (!name || name.startsWith('.')) continue;
    const from = path.join(legacyDir, name);
    const to = path.join(publicDir, name);
    try {
      if (!fs.existsSync(to) && fs.statSync(from).isFile()) {
        fs.copyFileSync(from, to);
      }
    } catch (_e) {
      /* skip file */
    }
  }
}

if (!process.env.VERCEL) {
  migrateProfilePhotosToPublic();
}

module.exports = {
  getProfilePhotoUploadDir,
  extractProfilePhotoFilename,
  resolveProfilePhotoPath,
  profilePhotoPublicUrl,
  normalizeProfilePhotoUrl,
  migrateProfilePhotosToPublic,
};
