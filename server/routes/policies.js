const express = require('express');
const path = require('path');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, enforceForcePasswordChange, requirePortalAdmin, isFounderUser } = require('../middleware/auth');
const { isAdminRole } = require('../constants/roles');
const { getUploadsRoot, getPublicDir } = require('../utils/storagePaths');
const { formatDisplayDate } = require('../utils/formatDate');

const router = express.Router();
const uploadDir = getUploadsRoot('policies');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 12).toLowerCase();
      const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      cb(null, safe);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (['.pdf', '.doc', '.docx'].includes(ext)) return cb(null, true);
    return cb(new Error('Only PDF, DOC, and DOCX files are allowed'));
  },
});

router.use(authMiddleware);
router.use(enforceForcePasswordChange);

const POLICY_TYPES = new Set(['policy', 'link']);

function mapPolicyRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    fileUrl: row.file_url,
    externalUrl: row.external_url,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    isVisible: row.is_visible,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtFormatted: formatDisplayDate(row.created_at),
  };
}

async function queryPolicies(visibleOnly) {
  const where = visibleOnly ? 'WHERE p.is_visible = TRUE' : '';
  const result = await pool.query(
    `
      SELECT
        p.id, p.title, p.description, p.type, p.file_url, p.external_url,
        p.uploaded_by, p.is_visible, p.created_at, p.updated_at,
        e.name AS uploaded_by_name
      FROM policy_documents p
      LEFT JOIN employees e ON e.id = p.uploaded_by
      ${where}
      ORDER BY p.created_at DESC
    `
  );
  return result.rows.map(mapPolicyRow);
}

/** GET policies — admin sees all; others see visible only */
router.get('/', async (req, res) => {
  try {
    const admin = Boolean(req.user?.adminId) || isAdminRole(req.user?.role) || isFounderUser(req.user);
    const policies = await queryPolicies(!admin);
    return res.json({ policies });
  } catch (err) {
    console.error('GET /policies:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST policy document upload — admin only */
router.post(
  '/upload',
  requirePortalAdmin,
  upload.single('file'),
  async (req, res) => {
    try {
      const title = String(req.body?.title || '').trim();
      const description = req.body?.description ? String(req.body.description).trim() : null;
      if (!title) return res.status(400).json({ message: 'Title is required' });
      if (!req.file) return res.status(400).json({ message: 'File is required' });

      const fileUrl = `/uploads/policies/${req.file.filename}`;
      const ins = await pool.query(
        `
          INSERT INTO policy_documents (title, description, type, file_url, uploaded_by, is_visible)
          VALUES ($1, $2, 'policy', $3, $4, TRUE)
          RETURNING id
        `,
        [title, description, fileUrl, req.user.id]
      );
      return res.status(201).json({ id: ins.rows[0].id, message: 'Policy uploaded' });
    } catch (err) {
      console.error('POST /policies/upload:', err.message);
      return res.status(400).json({ message: err.message || 'Upload failed' });
    }
  }
);

/** POST external link — admin only */
router.post('/link', requirePortalAdmin, async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const description = req.body?.description ? String(req.body.description).trim() : null;
    const externalUrl = String(req.body?.externalUrl || req.body?.external_url || '').trim();
    if (!title || !externalUrl) {
      return res.status(400).json({ message: 'Title and URL are required' });
    }
    let parsed;
    try {
      parsed = new URL(externalUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ message: 'URL must use http or https' });
      }
    } catch {
      return res.status(400).json({ message: 'Invalid URL format' });
    }

    const ins = await pool.query(
      `
        INSERT INTO policy_documents (title, description, type, external_url, uploaded_by, is_visible)
        VALUES ($1, $2, 'link', $3, $4, TRUE)
        RETURNING id
      `,
      [title, description, externalUrl, req.user.id]
    );
    return res.status(201).json({ id: ins.rows[0].id, message: 'Link added' });
  } catch (err) {
    console.error('POST /policies/link:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PATCH policy — admin only */
router.patch('/:id', requirePortalAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const existing = await pool.query('SELECT * FROM policy_documents WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ message: 'Not found' });

    const title = req.body?.title != null ? String(req.body.title).trim() : existing.rows[0].title;
    const description =
      req.body?.description != null ? String(req.body.description).trim() : existing.rows[0].description;
    const isVisible =
      req.body?.isVisible != null ? Boolean(req.body.isVisible) : existing.rows[0].is_visible;

    let externalUrl = existing.rows[0].external_url;
    if (req.body?.externalUrl != null || req.body?.external_url != null) {
      externalUrl = String(req.body.externalUrl || req.body.external_url || '').trim();
      if (existing.rows[0].type === 'link') {
        try {
          const parsed = new URL(externalUrl);
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            return res.status(400).json({ message: 'URL must use http or https' });
          }
        } catch {
          return res.status(400).json({ message: 'Invalid URL format' });
        }
      }
    }

    await pool.query(
      `
        UPDATE policy_documents
        SET title = $1, description = $2, is_visible = $3, external_url = $4, updated_at = NOW()
        WHERE id = $5
      `,
      [title, description, isVisible, externalUrl, id]
    );
    return res.json({ message: 'Updated' });
  } catch (err) {
    console.error('PATCH /policies/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** DELETE policy — admin only */
router.delete('/:id', requirePortalAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
    const del = await pool.query('DELETE FROM policy_documents WHERE id = $1 RETURNING id', [id]);
    if (!del.rows[0]) return res.status(404).json({ message: 'Not found' });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /policies/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
