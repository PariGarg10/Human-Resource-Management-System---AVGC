

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../db');
const { authMiddleware, enforcePasswordChange } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { ageFromDateOfBirth } = require('../utils/birthdays');

const router = express.Router();

const profileUploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'profile-photos');
fs.mkdirSync(profileUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, profileUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 8) || '.bin';
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Only JPEG, PNG, GIF, or WebP images are allowed'));
  },
});

function maybeUpload(req, res, next) {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    return upload.single('profilePhoto')(req, res, next);
  }
  return next();
}

function rowToProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeecode: row.employeecode,
    name: row.name,
    email: row.email,
    department: row.department,
    role: row.role,
    dateOfBirth: row.dateofbirth || null,
    phone: row.phone || null,
    location: row.location || null,
    bio: row.bio || null,
    profilePhotoUrl: row.profilephotourl || null,
    age: ageFromDateOfBirth(row.dateofbirth),
    createdAt: row.createdat,
  };
}

router.get('/me', authMiddleware, (req, res) => {
  const row = db
    .prepare(
      `
      SELECT id, employeecode, name, email, department, role, dateofbirth, phone, location, bio, profilephotourl, createdat
      FROM employees WHERE id = ?
    `
    )
    .get(req.user.id);

  if (!row) return res.status(404).json({ message: 'User not found' });
  return res.json({ profile: rowToProfile(row) });
});

router.use(authMiddleware);
router.use(enforcePasswordChange);

function parseProfileFields(body) {
  const name = body.name != null ? String(body.name).trim() : undefined;
  const phone = body.phone != null ? String(body.phone).trim() || null : undefined;
  const location = body.location != null ? String(body.location).trim() || null : undefined;
  const bio = body.bio != null ? String(body.bio).trim() || null : undefined;
  const rawDob = body.dateOfBirth != null ? String(body.dateOfBirth).trim() : undefined;
  let dateOfBirth = undefined;
  if (rawDob !== undefined) {
    if (rawDob === '') dateOfBirth = null;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDob)) dateOfBirth = rawDob;
    else throw new Error('dateOfBirth must be YYYY-MM-DD or empty');
  }
  return { name, phone, location, bio, dateOfBirth };
}

function applyProfileUpdate(userId, fields, profilePhotoUrl) {
  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(userId);
  if (!row) throw new Error('User not found');

  const next = {
    name: fields.name !== undefined ? fields.name : row.name,
    phone: fields.phone !== undefined ? fields.phone : row.phone,
    location: fields.location !== undefined ? fields.location : row.location,
    bio: fields.bio !== undefined ? fields.bio : row.bio,
    dateofbirth: fields.dateOfBirth !== undefined ? fields.dateOfBirth : row.dateofbirth,
    profilephotourl: profilePhotoUrl !== undefined ? profilePhotoUrl : row.profilephotourl,
  };

  if (fields.name !== undefined && !next.name) {
    throw new Error('name cannot be empty');
  }

  db.prepare(
    `
    UPDATE employees
    SET name = ?, phone = ?, location = ?, bio = ?, dateofbirth = ?, profilephotourl = ?
    WHERE id = ?
  `
  ).run(
    next.name,
    next.phone,
    next.location,
    next.bio,
    next.dateofbirth,
    next.profilephotourl,
    userId
  );

  return db
    .prepare(
      `
      SELECT id, employeecode, name, email, department, role, dateofbirth, phone, location, bio, profilephotourl, createdat
      FROM employees WHERE id = ?
    `
    )
    .get(userId);
}

function handlePatch(req, res, userId) {
  try {
    let fields;
    try {
      fields = parseProfileFields(req.body);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    let photoUrl;
    if (req.file) {
      photoUrl = `/uploads/profile-photos/${req.file.filename}`;
    }

    const updated = applyProfileUpdate(userId, fields, photoUrl);
    logAudit(userId, 'PROFILE_UPDATED', 'employees', { id: userId });
    return res.json({ profile: rowToProfile(updated), message: 'Profile updated' });
  } catch (e) {
    return res.status(400).json({ message: e.message || 'Update failed' });
  }
}

router.patch('/me', maybeUpload, (req, res) => handlePatch(req, res, req.user.id));

router.patch('/:id', maybeUpload, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id !== req.user.id) {
    return res.status(403).json({ message: 'You can only update your own profile' });
  }
  return handlePatch(req, res, req.user.id);
});

router.use((err, _req, res, _next) => {
  if (!err) return _next();
  const msg = err.message || 'Upload failed';
  const status = msg.includes('Only JPEG') || msg.includes('File too large') ? 400 : 400;
  return res.status(status).json({ message: msg });
});

module.exports = router;

// CHANGE your profile update route to:
router.patch('/profile', upload.single('avatar'), async (req, res) => {
  const updates = { ...req.body };
  if (req.file) {
    updates.avatar_url = `/uploads/${req.file.filename}`;
  }
  // run your existing DB update with `updates`
});