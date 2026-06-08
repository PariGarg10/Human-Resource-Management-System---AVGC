const express = require('express');
const path = require('path');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, enforceForcePasswordChange, requirePortalAdmin } = require('../middleware/auth');
const { getUploadsRoot } = require('../utils/storagePaths');
const { ensureHomeRecognitionTable, mapRow } = require('../utils/homeRecognition');

const router = express.Router();
const uploadDir = getUploadsRoot('home-recognition');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 12).toLowerCase();
      const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      cb(null, safe);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return cb(null, true);
    return cb(new Error('Only JPG, PNG, WEBP, and GIF images are allowed'));
  },
});

function uploadSingle(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
      return next();
    });
  };
}

function parseCategory(value) {
  const category = String(value || '').trim().toLowerCase();
  if (category === 'top_performer' || category === 'team_lead' || category === 'employee') {
    return category;
  }
  return null;
}

function groupByCategory(rows) {
  const topPerformers = [];
  const teamLeads = [];
  const employees = [];
  for (const row of rows) {
    const item = mapRow(row);
    if (item.category === 'top_performer') topPerformers.push(item);
    else if (item.category === 'team_lead') teamLeads.push(item);
    else if (item.category === 'employee') employees.push(item);
  }
  return { topPerformers, teamLeads, employees };
}

/** Public list — visible entries only */
router.get('/', async (_req, res) => {
  try {
    await ensureHomeRecognitionTable();
    const result = await pool.query(
      `
        SELECT id, category, name, designation, image_url, sort_order, is_visible,
               uploaded_by, created_at, updated_at
        FROM homepage_recognition
        WHERE is_visible = TRUE
        ORDER BY category, sort_order ASC, created_at ASC
      `
    );
    return res.json(groupByCategory(result.rows));
  } catch (err) {
    console.error('GET /home-recognition:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.use(authMiddleware);
router.use(enforceForcePasswordChange);

/** Admin list — all entries */
router.get('/admin', requirePortalAdmin, async (_req, res) => {
  try {
    await ensureHomeRecognitionTable();
    const result = await pool.query(
      `
        SELECT id, category, name, designation, image_url, sort_order, is_visible,
               uploaded_by, created_at, updated_at
        FROM homepage_recognition
        ORDER BY category, sort_order ASC, created_at ASC
      `
    );
    return res.json({ items: result.rows.map(mapRow) });
  } catch (err) {
    console.error('GET /home-recognition/admin:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** Create entry */
router.post(
  '/',
  requirePortalAdmin,
  uploadSingle('image'),
  async (req, res) => {
    try {
      await ensureHomeRecognitionTable();
      const category = parseCategory(req.body?.category);
      const name = String(req.body?.name || '').trim();
      const designation = String(req.body?.designation || '').trim();
      const sortOrder = Number.parseInt(String(req.body?.sortOrder ?? req.body?.sort_order ?? '0'), 10);

      if (!category) {
        return res.status(400).json({ message: 'Category must be top_performer, team_lead, or employee' });
      }
      if (!name) return res.status(400).json({ message: 'Name is required' });
      if (!designation) return res.status(400).json({ message: 'Designation is required' });

      const imageUrl = req.file ? `/uploads/home-recognition/${req.file.filename}` : null;

      const ins = await pool.query(
        `
          INSERT INTO homepage_recognition
            (category, name, designation, image_url, sort_order, uploaded_by)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `,
        [category, name, designation, imageUrl, Number.isFinite(sortOrder) ? sortOrder : 0, req.user.id]
      );

      return res.status(201).json({ id: ins.rows[0].id, message: 'Added to homepage' });
    } catch (err) {
      console.error('POST /home-recognition:', err.message);
      return res.status(400).json({ message: err.message || 'Could not add entry' });
    }
  }
);

/** Update entry */
router.patch(
  '/:id',
  requirePortalAdmin,
  uploadSingle('image'),
  async (req, res) => {
    try {
      await ensureHomeRecognitionTable();
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

      const existing = await pool.query('SELECT * FROM homepage_recognition WHERE id = $1', [id]);
      if (!existing.rows.length) return res.status(404).json({ message: 'Entry not found' });

      const fields = [];
      const values = [];
      let idx = 1;

      if (req.body?.name != null) {
        const name = String(req.body.name).trim();
        if (!name) return res.status(400).json({ message: 'Name cannot be empty' });
        fields.push(`name = $${idx++}`);
        values.push(name);
      }

      if (req.body?.designation != null) {
        const designation = String(req.body.designation).trim();
        if (!designation) return res.status(400).json({ message: 'Designation cannot be empty' });
        fields.push(`designation = $${idx++}`);
        values.push(designation);
      }

      if (req.body?.category != null) {
        const category = parseCategory(req.body.category);
        if (!category) return res.status(400).json({ message: 'Invalid category' });
        fields.push(`category = $${idx++}`);
        values.push(category);
      }

      if (req.body?.sortOrder != null || req.body?.sort_order != null) {
        const sortOrder = Number.parseInt(String(req.body.sortOrder ?? req.body.sort_order), 10);
        fields.push(`sort_order = $${idx++}`);
        values.push(Number.isFinite(sortOrder) ? sortOrder : 0);
      }

      if (req.body?.isVisible != null || req.body?.is_visible != null) {
        const raw = req.body.isVisible ?? req.body.is_visible;
        const isVisible = raw === true || raw === 'true' || raw === '1' || raw === 1;
        fields.push(`is_visible = $${idx++}`);
        values.push(isVisible);
      }

      if (req.file) {
        fields.push(`image_url = $${idx++}`);
        values.push(`/uploads/home-recognition/${req.file.filename}`);
      }

      if (!fields.length) return res.status(400).json({ message: 'No changes provided' });

      fields.push(`updated_at = NOW()`);
      values.push(id);

      await pool.query(
        `UPDATE homepage_recognition SET ${fields.join(', ')} WHERE id = $${idx}`,
        values
      );

      return res.json({ message: 'Updated' });
    } catch (err) {
      console.error('PATCH /home-recognition/:id:', err.message);
      return res.status(400).json({ message: err.message || 'Update failed' });
    }
  }
);

/** Remove entry */
router.delete(
  '/:id',
  requirePortalAdmin,
  async (req, res) => {
    try {
      await ensureHomeRecognitionTable();
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

      const del = await pool.query('DELETE FROM homepage_recognition WHERE id = $1 RETURNING id', [id]);
      if (!del.rows.length) return res.status(404).json({ message: 'Entry not found' });

      return res.json({ message: 'Removed' });
    } catch (err) {
      console.error('DELETE /home-recognition/:id:', err.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

module.exports = router;
