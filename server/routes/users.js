const express = require('express');
const path = require('path');
const multer = require('multer');
const {
  getProfilePhotoUploadDir,
  normalizeProfilePhotoUrl,
  profilePhotoPublicUrl,
  resolveProfilePhotoPath,
} = require('../utils/profilePhoto');
const { pool } = require('../db');
const { authMiddleware, enforcePasswordChange } = require('../middleware/auth');
const { buildOrgSections } = require('../utils/orgDirectory');
const { ensurePersonalTasksTable, rowToTask, PRIORITIES, parseDueDateInput } = require('../utils/personalTasks');
const { logAudit } = require('../utils/audit');
const { ageFromDateOfBirth } = require('../utils/birthdays');

const router = express.Router();

const profileUploadDir = getProfilePhotoUploadDir();

const storage = process.env.VERCEL
  ? multer.memoryStorage()
  : multer.diskStorage({
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
    designation: row.role,
    dateOfBirth: row.dateofbirth || null,
    phone: row.phone || null,
    location: row.location || null,
    bio: row.bio || null,
    profilePhotoUrl: normalizeProfilePhotoUrl(row.profilephotourl),
    age: ageFromDateOfBirth(row.dateofbirth),
    createdAt: row.createdat,
  };
}

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

let profilePhotoColumnsReady = false;

async function ensureProfilePhotoColumns() {
  if (profilePhotoColumnsReady) return;
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile_photo BYTEA');
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile_photo_mime TEXT');
  profilePhotoColumnsReady = true;
}

async function applyProfileUpdate(userId, fields, profilePhotoUrl, profileFile) {
  const rowResult = await pool.query('SELECT * FROM employees WHERE id = $1', [userId]);
  const row = rowResult.rows[0];
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

  if (profileFile?.buffer) {
    await ensureProfilePhotoColumns();
    await pool.query(
      `
      UPDATE employees
      SET name = $1, phone = $2, location = $3, bio = $4, dateofbirth = $5, profilephotourl = $6,
          profile_photo = $7, profile_photo_mime = $8
      WHERE id = $9
    `,
      [
        next.name,
        next.phone,
        next.location,
        next.bio,
        next.dateofbirth,
        next.profilephotourl,
        profileFile.buffer,
        profileFile.mimetype || 'image/jpeg',
        userId,
      ]
    );
  } else {
    await pool.query(
      `
      UPDATE employees
      SET name = $1, phone = $2, location = $3, bio = $4, dateofbirth = $5, profilephotourl = $6
      WHERE id = $7
    `,
      [next.name, next.phone, next.location, next.bio, next.dateofbirth, next.profilephotourl, userId]
    );
  }

  const updatedResult = await pool.query(
    `
      SELECT id, employeecode, name, email, department, role, dateofbirth, phone, location, bio, profilephotourl, createdat
      FROM employees WHERE id = $1
    `,
    [userId]
  );
  return updatedResult.rows[0];
}

async function handlePatch(req, res, userId) {
  try {
    let fields;
    try {
      fields = parseProfileFields(req.body);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    let photoUrl;
    let profileFile;
    if (req.file) {
      if (process.env.VERCEL && req.file.buffer) {
        photoUrl = '/api/users/profile-photo/me';
        profileFile = req.file;
      } else {
        photoUrl = profilePhotoPublicUrl(req.file.filename);
      }
    }

    const updated = await applyProfileUpdate(userId, fields, photoUrl, profileFile);
    await logAudit(userId, 'PROFILE_UPDATED', 'employees', { id: userId });
    return res.json({ profile: rowToProfile(updated), message: 'Profile updated' });
  } catch (e) {
    if (e.message === 'User not found') {
      return res.status(404).json({ message: e.message });
    }
    if (e.message && !e.code) {
      return res.status(400).json({ message: e.message || 'Update failed' });
    }
    console.error('PATCH /users profile:', e.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function patchProfile(req, res, userId) {
  try {
    return await handlePatch(req, res, userId);
  } catch (err) {
    console.error('PATCH /users:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

router.get('/org-directory', authMiddleware, enforcePasswordChange, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT id, employeecode, name, email, department, role, profilephotourl
      FROM employees
      WHERE COALESCE(isregistered, TRUE) = TRUE
      ORDER BY name ASC
    `
    );
    const sections = buildOrgSections(rows);
    return res.json({
      sections,
      total: rows.length,
    });
  } catch (err) {
    console.error('GET /users/org-directory:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/my-tasks', authMiddleware, enforcePasswordChange, async (req, res) => {
  try {
    await ensurePersonalTasksTable();
    const { rows } = await pool.query(
      `
      SELECT id, title, priority,
             COALESCE(duedate::text, to_char(createdat::date, 'YYYY-MM-DD')) AS duedate,
             done, createdat
      FROM personal_tasks
      WHERE employeeid = $1
      ORDER BY done ASC, duedate DESC, id DESC
    `,
      [req.user.id]
    );
    return res.json({ tasks: rows.map(rowToTask) });
  } catch (err) {
    console.error('GET /users/my-tasks:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/my-tasks', authMiddleware, enforcePasswordChange, async (req, res) => {
  try {
    await ensurePersonalTasksTable();
    const title = String(req.body.title || '').trim();
    const priority = String(req.body.priority || 'Medium').trim();
    const dueDate = parseDueDateInput(req.body.dueDate ?? req.body.duedate);

    if (!title) return res.status(400).json({ message: 'Title is required' });
    if (!PRIORITIES.has(priority)) return res.status(400).json({ message: 'Invalid priority' });
    if (!dueDate) {
      return res.status(400).json({ message: 'dueDate must be YYYY-MM-DD' });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO personal_tasks (employeeid, title, priority, duedate)
      VALUES ($1, $2, $3, $4::date)
      RETURNING id, title, priority, duedate::text AS duedate, done
    `,
      [req.user.id, title, priority, dueDate]
    );
    return res.status(201).json({ task: rowToTask(rows[0]) });
  } catch (err) {
    console.error('POST /users/my-tasks:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/my-tasks/:taskId', authMiddleware, enforcePasswordChange, async (req, res) => {
  try {
    await ensurePersonalTasksTable();
    const taskId = Number(req.params.taskId);
    if (!Number.isFinite(taskId)) return res.status(400).json({ message: 'Invalid task id' });

    const existing = await pool.query(
      `
      SELECT id, title, priority, duedate::text AS duedate, done
      FROM personal_tasks
      WHERE id = $1 AND employeeid = $2
    `,
      [taskId, req.user.id]
    );
    if (!existing.rows[0]) return res.status(404).json({ message: 'Task not found' });

    const row = existing.rows[0];
    const sets = [];
    const params = [];
    let idx = 1;

    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ message: 'Title is required' });
      sets.push(`title = $${idx++}`);
      params.push(title);
    }
    if (req.body.priority !== undefined) {
      const priority = String(req.body.priority).trim();
      if (!PRIORITIES.has(priority)) return res.status(400).json({ message: 'Invalid priority' });
      sets.push(`priority = $${idx++}`);
      params.push(priority);
    }
    const hasDueDate =
      Object.prototype.hasOwnProperty.call(req.body, 'dueDate') ||
      Object.prototype.hasOwnProperty.call(req.body, 'duedate');
    if (hasDueDate) {
      const rawDue = req.body.dueDate ?? req.body.duedate;
      if (rawDue !== null && rawDue !== '') {
        const dueDate = parseDueDateInput(rawDue);
        if (!dueDate) return res.status(400).json({ message: 'dueDate must be YYYY-MM-DD' });
        sets.push(`duedate = $${idx++}::date`);
        params.push(dueDate);
      }
    }
    if (req.body.done !== undefined) {
      sets.push(`done = $${idx++}`);
      const doneVal = req.body.done;
      params.push(doneVal === true || doneVal === 'true' || doneVal === 1 || doneVal === '1');
    }

    if (!sets.length) {
      return res.json({ task: rowToTask(row) });
    }

    params.push(taskId, req.user.id);
    const { rows } = await pool.query(
      `
      UPDATE personal_tasks
      SET ${sets.join(', ')}
      WHERE id = $${idx++} AND employeeid = $${idx}
      RETURNING id, title, priority, duedate::text AS duedate, done
    `,
      params
    );
    return res.json({ task: rowToTask(rows[0]) });
  } catch (err) {
    console.error('PATCH /users/my-tasks/:taskId:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/my-tasks/:taskId', authMiddleware, enforcePasswordChange, async (req, res) => {
  try {
    await ensurePersonalTasksTable();
    const taskId = Number(req.params.taskId);
    if (!Number.isFinite(taskId)) return res.status(400).json({ message: 'Invalid task id' });

    const result = await pool.query(
      'DELETE FROM personal_tasks WHERE id = $1 AND employeeid = $2 RETURNING id',
      [taskId, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Task not found' });
    return res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('DELETE /users/my-tasks/:taskId:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/profile-photo/me', authMiddleware, async (req, res) => {
  try {
    await ensureProfilePhotoColumns();
    const result = await pool.query(
      'SELECT profile_photo, profile_photo_mime FROM employees WHERE id = $1',
      [req.user.id]
    );
    const row = result.rows[0];
    if (!row?.profile_photo) {
      return res.status(404).json({ message: 'Photo not found' });
    }
    res.setHeader('Content-Type', row.profile_photo_mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(row.profile_photo);
  } catch (err) {
    console.error('GET /users/profile-photo/me:', err.message);
    return res.status(500).json({ message: 'Could not load photo' });
  }
});

router.get('/profile-photo/:filename', (req, res) => {
  try {
    if (req.params.filename === 'me') {
      return res.status(404).json({ message: 'Photo not found' });
    }
    const filePath = resolveProfilePhotoPath(req.params.filename);
    if (!filePath) {
      return res.status(404).json({ message: 'Photo not found' });
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.sendFile(path.resolve(filePath));
  } catch (err) {
    console.error('GET /users/profile-photo:', err.message);
    return res.status(500).json({ message: 'Could not load photo' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, employeecode, name, email, department, role, dateofbirth, phone, location, bio, profilephotourl, createdat
      FROM employees WHERE id = $1
    `,
      [req.user.id]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ message: 'User not found' });
    return res.json({ profile: rowToProfile(row) });
  } catch (err) {
    console.error('GET /users/me:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id !== req.user.id) {
      return res.status(403).json({ message: 'You can only read your own profile' });
    }
    const result = await pool.query(
      `
      SELECT id, employeecode, name, email, department, role, dateofbirth, phone, location, bio, profilephotourl, createdat
      FROM employees WHERE id = $1
    `,
      [req.user.id]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ message: 'User not found' });
    return res.json({ profile: rowToProfile(row) });
  } catch (err) {
    console.error('GET /users/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.use(authMiddleware);

router.patch('/me', maybeUpload, (req, res) => patchProfile(req, res, req.user.id));

router.patch('/:id', maybeUpload, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id !== req.user.id) {
    return res.status(403).json({ message: 'You can only update your own profile' });
  }
  return patchProfile(req, res, req.user.id);
});

router.use((err, _req, res, _next) => {
  if (!err) return _next();
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Image must be 3MB or smaller' });
    }
    return res.status(400).json({ message: err.message || 'Upload failed' });
  }
  const msg = err.message || 'Upload failed';
  return res.status(400).json({ message: msg });
});

module.exports = router;
