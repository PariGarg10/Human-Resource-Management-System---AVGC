const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, enforcePasswordChange } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'concerns');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 12) || '.bin';
      const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      cb(null, safe);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use(authMiddleware);
router.use(enforcePasswordChange);

const PRIORITIES = new Set(['Low', 'Medium', 'High', 'Urgent']);
let responseAttachmentColumnReady = false;

async function ensureResponseAttachmentColumn() {
  if (responseAttachmentColumnReady) return;
  await pool.query('ALTER TABLE concerns ADD COLUMN IF NOT EXISTS responseattachmenturl TEXT');
  responseAttachmentColumnReady = true;
}

async function activeEmployee(id) {
  const result = await pool.query(
    `
      SELECT id, name, email, role, department
      FROM employees
      WHERE id = $1
        AND COALESCE(isregistered, TRUE) = TRUE
    `,
    [id]
  );
  return result.rows[0];
}

async function firstActiveAdmin(exceptId) {
  const result = await pool.query(
    `
      SELECT id, name
      FROM employees
      WHERE role = 'admin'
        AND id != $1
        AND COALESCE(isregistered, TRUE) = TRUE
      ORDER BY id ASC
      LIMIT 1
    `,
    [exceptId]
  );
  return result.rows[0];
}

async function resolveRaisedTo(userId, raisedTo) {
  const key = String(raisedTo || '').toLowerCase().trim();

  if (key === 'my_manager') {
    const managerResult = await pool.query(
      `
        SELECT e.id, e.name
        FROM manageremployees me
        JOIN employees e ON e.id = me.managerid
        WHERE me.employeeid = $1
          AND COALESCE(e.isregistered, TRUE) = TRUE
        ORDER BY e.id ASC
        LIMIT 1
      `,
      [userId]
    );
    const manager = managerResult.rows[0];
    if (manager) return manager;
    const fallbackAdmin = await firstActiveAdmin(userId);
    if (fallbackAdmin) return fallbackAdmin;
    throw new Error('No manager or admin is available for this concern');
  }

  if (key === 'admin') {
    const admin = await firstActiveAdmin(userId);
    if (admin) return admin;
    throw new Error('No admin is available for this concern');
  }

  if (key === 'it_head') {
    const itHeadResult = await pool.query(
      `
        SELECT id, name
        FROM employees
        WHERE id != $1
          AND role IN ('it_head', 'manager', 'admin')
          AND COALESCE(isregistered, TRUE) = TRUE
          AND (
            role = 'it_head'
            OR
            lower(COALESCE(department, '')) LIKE '%it%'
            OR lower(COALESCE(department, '')) LIKE '%tech%'
            OR lower(COALESCE(department, '')) LIKE '%information%'
          )
        ORDER BY CASE role WHEN 'it_head' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, id ASC
        LIMIT 1
      `,
      [userId]
    );
    const itHead = itHeadResult.rows[0];
    if (itHead) return itHead;
    const fallbackAdmin = await firstActiveAdmin(userId);
    if (fallbackAdmin) return fallbackAdmin;
    throw new Error('No IT Head or admin is available for this concern');
  }

  throw new Error('raisedTo must be Admin, IT Head, or My Manager');
}

function rowToConcern(row) {
  return {
    id: row.id,
    raisedBy: row.raised_by,
    raisedTo: row.raised_to,
    subject: row.subject,
    description: row.description,
    priority: row.priority || 'Medium',
    status: row.status,
    response: row.response || null,
    attachmentUrl: row.attachmenturl || null,
    responseAttachmentUrl: row.responseattachmenturl || null,
    createdAt: row.created_at,
    respondedAt: row.responded_at || null,
    raisedByName: row.raised_by_name,
    raisedToName: row.raised_to_name,
  };
}

function concernSelect(whereClause) {
  return `
    SELECT c.*,
           rb.name AS raised_by_name,
           rt.name AS raised_to_name
    FROM concerns c
    JOIN employees rb ON rb.id = c.raised_by
    JOIN employees rt ON rt.id = c.raised_to
    ${whereClause}
    ORDER BY c.created_at DESC
  `;
}

router.post('/', upload.single('attachment'), async (req, res) => {
  try {
    await ensureResponseAttachmentColumn();
    const subject = String(req.body.subject || '').trim();
    const description = String(req.body.description || '').trim();
    const raisedToValue = req.body.raisedTo || req.body.raised_to;
    const priority = String(req.body.priority || 'Medium').trim();

    if (!subject || !description) {
      return res.status(400).json({ message: 'Subject and description are required' });
    }
    if (!PRIORITIES.has(priority)) {
      return res.status(400).json({ message: 'Invalid priority' });
    }

    let recipient;
    try {
      recipient = await resolveRaisedTo(req.user.id, raisedToValue);
    } catch (error) {
      return res.status(400).json({ message: error.message || 'Invalid recipient' });
    }

    const attachmentUrl = req.file ? `/uploads/concerns/${req.file.filename}` : null;
    const insertResult = await pool.query(
      `
      INSERT INTO concerns (raised_by, raised_to, subject, description, priority, attachmenturl)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `,
      [req.user.id, recipient.id, subject, description, priority, attachmentUrl]
    );

    await pool.query(
      `INSERT INTO notifications (userid, message, type, isread, subjectemployeeid) VALUES ($1, $2, 'concern', FALSE, $3)`,
      [recipient.id, `New ${priority.toLowerCase()} concern: ${subject}`, req.user.id]
    );

    const id = insertResult.rows[0].id;
    await logAudit(req.user.id, 'CONCERN_RAISED', 'concerns', { concernId: id, raisedTo: recipient.id });
    return res.status(201).json({ message: 'Concern raised', id, raisedTo: recipient });
  } catch (err) {
    console.error('POST /concerns:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/my', async (req, res) => {
  try {
    await ensureResponseAttachmentColumn();
    const { rows } = await pool.query(concernSelect('WHERE c.raised_by = $1'), [req.user.id]);
    return res.json({ concerns: rows.map(rowToConcern) });
  } catch (err) {
    console.error('GET /concerns/my:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/inbox', async (req, res) => {
  try {
    await ensureResponseAttachmentColumn();
    const { rows } = await pool.query(concernSelect('WHERE c.raised_to = $1'), [req.user.id]);
    return res.json({ concerns: rows.map(rowToConcern) });
  } catch (err) {
    console.error('GET /concerns/inbox:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/all', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only admins can view all requests' });
  }
  try {
    await ensureResponseAttachmentColumn();
    const { rows } = await pool.query(concernSelect(''));
    return res.json({ concerns: rows.map(rowToConcern) });
  } catch (err) {
    console.error('GET /concerns/all:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/:id/respond', upload.single('responseAttachment'), async (req, res) => {
  try {
    await ensureResponseAttachmentColumn();
    const id = Number(req.params.id);
    const response = String(req.body.response || '').trim();
    const close = Boolean(req.body.close);

    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid concern id' });
    if (!response) return res.status(400).json({ message: 'Response is required' });

    const concernResult = await pool.query('SELECT * FROM concerns WHERE id = $1', [id]);
    const concern = concernResult.rows[0];
    if (!concern) return res.status(404).json({ message: 'Concern not found' });
    if (concern.raised_to !== req.user.id) {
      return res.status(403).json({ message: 'You can only respond to concerns assigned to you' });
    }
    if (!(await activeEmployee(concern.raised_by))) {
      return res.status(404).json({ message: 'Concern raiser not found' });
    }

    const nextStatus = close ? 'Closed' : 'Responded';
    const responseAttachmentUrl = req.file ? `/uploads/concerns/${req.file.filename}` : concern.responseattachmenturl || null;
    await pool.query(
      `
      UPDATE concerns
      SET status = $1, response = $2, responseattachmenturl = $3, responded_at = NOW()
      WHERE id = $4
    `,
      [nextStatus, response, responseAttachmentUrl, id]
    );

    await pool.query(
      `INSERT INTO notifications (userid, message, type, isread, subjectemployeeid) VALUES ($1, $2, 'concern_response', FALSE, $3)`,
      [concern.raised_by, `Your concern "${concern.subject}" has been ${nextStatus.toLowerCase()}.`, req.user.id]
    );

    await logAudit(req.user.id, 'CONCERN_RESPONDED', 'concerns', { concernId: id, status: nextStatus });
    return res.json({ message: `Concern marked as ${nextStatus}`, status: nextStatus });
  } catch (err) {
    console.error('PATCH /concerns/:id/respond:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Attachment must be 5MB or smaller' });
    }
    return res.status(400).json({ message: err.message || 'Upload failed' });
  }
  if (err) return res.status(400).json({ message: err.message || 'Upload failed' });
  return _next();
});

module.exports = router;
