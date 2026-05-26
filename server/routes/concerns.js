const express = require('express');
const path = require('path');
const multer = require('multer');
const { getUploadsRoot } = require('../utils/storagePaths');
const { pool } = require('../db');
const { authMiddleware, enforcePasswordChange } = require('../middleware/auth');
const { resolveAdminContext } = require('../middleware/adminAuth');
const { PERMISSION_MODULES } = require('../utils/adminPermissions');
const { logAudit } = require('../utils/audit');

const router = express.Router();
const uploadDir = getUploadsRoot('concerns');

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
let concernSchemaReady = false;

async function ensureConcernSchema() {
  if (concernSchemaReady) return;
  await pool.query('ALTER TABLE concerns ADD COLUMN IF NOT EXISTS responseattachmenturl TEXT');
  await pool.query(
    'ALTER TABLE concerns ADD COLUMN IF NOT EXISTS awaiting_reply_from INTEGER REFERENCES employees(id) ON DELETE SET NULL'
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS concern_messages (
      id SERIAL PRIMARY KEY,
      concern_id INTEGER NOT NULL REFERENCES concerns(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      attachmenturl TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_concern_messages_concern ON concern_messages (concern_id, created_at ASC)'
  );
  await pool.query(`
    UPDATE concerns
    SET awaiting_reply_from = raised_to
    WHERE status = 'Open' AND awaiting_reply_from IS NULL
  `);
  await pool.query(`
    UPDATE concerns
    SET awaiting_reply_from = raised_by
    WHERE status = 'Responded' AND awaiting_reply_from IS NULL
  `);
  await pool.query(`
    UPDATE concerns
    SET awaiting_reply_from = NULL
    WHERE status = 'Closed'
  `);
  concernSchemaReady = true;
}

function resolveAwaitingReply(concern) {
  if (concern.status === 'Closed') return null;
  if (concern.awaiting_reply_from) return concern.awaiting_reply_from;
  if (concern.status === 'Open' && !concern.response) return concern.raised_to;
  if (concern.status === 'Responded') return concern.raised_by;
  return concern.raised_to;
}

function canUserReply(concern, userId) {
  if (concern.status === 'Closed') return false;
  const awaiting = resolveAwaitingReply(concern);
  return awaiting === userId;
}

async function loadConcernMessages(concernIds) {
  if (!concernIds.length) return new Map();
  const { rows } = await pool.query(
    `
      SELECT cm.id, cm.concern_id, cm.author_id, cm.body, cm.attachmenturl, cm.created_at,
             e.name AS author_name
      FROM concern_messages cm
      JOIN employees e ON e.id = cm.author_id
      WHERE cm.concern_id = ANY($1::int[])
      ORDER BY cm.created_at ASC
    `,
    [concernIds]
  );
  const byConcern = new Map();
  for (const row of rows) {
    const list = byConcern.get(row.concern_id) || [];
    list.push({
      id: row.id,
      authorId: row.author_id,
      authorName: row.author_name,
      body: row.body,
      attachmentUrl: row.attachmenturl || null,
      createdAt: row.created_at,
    });
    byConcern.set(row.concern_id, list);
  }
  return byConcern;
}

async function mapConcernsWithMessages(rows) {
  const messageMap = await loadConcernMessages(rows.map((r) => r.id));
  return rows.map((row) => {
    const concern = rowToConcern(row);
    concern.messages = messageMap.get(row.id) || [];
    concern.awaitingReplyFrom = resolveAwaitingReply(row);
    return concern;
  });
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

async function firstActiveDirector(exceptId) {
  const result = await pool.query(
    `
      SELECT id, name
      FROM employees
      WHERE id != $1
        AND COALESCE(isregistered, TRUE) = TRUE
        AND (
          lower(COALESCE(role, '')) = 'director'
          OR lower(COALESCE(role, '')) LIKE '%director%'
          OR lower(COALESCE(name, '')) LIKE '%director%'
        )
      ORDER BY id ASC
      LIMIT 1
    `,
    [exceptId]
  );
  return result.rows[0];
}

async function resolveRaisedTo(userId, raisedTo) {
  const key = String(raisedTo || '').toLowerCase().trim();

  if (key === 'director') {
    const director = await firstActiveDirector(userId);
    if (director) return director;
  }

  if (key === 'my_manager' || key === 'director') {
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
    throw new Error(key === 'director' ? 'No director, manager, or admin is available for this concern' : 'No manager or admin is available for this concern');
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

  throw new Error('raisedTo must be Admin, IT Head, or Director');
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
    awaitingReplyFrom: resolveAwaitingReply(row),
    createdAt: row.created_at,
    respondedAt: row.responded_at || null,
    raisedByName: row.raised_by_name,
    raisedToName: row.raised_to_name,
    messages: [],
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
    await ensureConcernSchema();
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
      INSERT INTO concerns (raised_by, raised_to, subject, description, priority, attachmenturl, awaiting_reply_from)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
      [req.user.id, recipient.id, subject, description, priority, attachmentUrl, recipient.id]
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
    await ensureConcernSchema();
    const { rows } = await pool.query(concernSelect('WHERE c.raised_by = $1'), [req.user.id]);
    const concerns = await mapConcernsWithMessages(rows);
    return res.json({
      concerns: concerns.map((c) => ({ ...c, canReply: canUserReply(rows.find((r) => r.id === c.id), req.user.id) })),
    });
  } catch (err) {
    console.error('GET /concerns/my:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/inbox', async (req, res) => {
  try {
    await ensureConcernSchema();
    const { rows } = await pool.query(concernSelect('WHERE c.raised_to = $1'), [req.user.id]);
    const concerns = await mapConcernsWithMessages(rows);
    return res.json({
      concerns: concerns.map((c) => ({ ...c, canReply: canUserReply(rows.find((r) => r.id === c.id), req.user.id) })),
    });
  } catch (err) {
    console.error('GET /concerns/inbox:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/all', async (req, res) => {
  const ctx = await resolveAdminContext(req.user);
  if (!ctx) {
    return res.status(403).json({ message: 'Only admins can view all requests' });
  }
  if (!ctx.isSuperAdmin && !ctx.permissions.includes(PERMISSION_MODULES.REQUEST_APPROVALS)) {
    return res.status(403).json({ message: 'Forbidden: request approvals permission required' });
  }
  try {
    await ensureConcernSchema();
    const { rows } = await pool.query(concernSelect(''));
    const concerns = await mapConcernsWithMessages(rows);
    return res.json({ concerns });
  } catch (err) {
    console.error('GET /concerns/all:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/:id/respond', upload.single('responseAttachment'), async (req, res) => {
  try {
    await ensureConcernSchema();
    const id = Number(req.params.id);
    const response = String(req.body.response || '').trim();
    const close = req.body.close === true || req.body.close === 'true';

    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid concern id' });
    if (!response) return res.status(400).json({ message: 'Response is required' });

    const concernResult = await pool.query('SELECT * FROM concerns WHERE id = $1', [id]);
    const concern = concernResult.rows[0];
    if (!concern) return res.status(404).json({ message: 'Concern not found' });
    if (!(await activeEmployee(concern.raised_by))) {
      return res.status(404).json({ message: 'Concern raiser not found' });
    }
    if (!(await activeEmployee(concern.raised_to))) {
      return res.status(404).json({ message: 'Concern recipient not found' });
    }

    const isAssignee = concern.raised_to === req.user.id;
    const isRaiser = concern.raised_by === req.user.id;
    if (!isAssignee && !isRaiser) {
      return res.status(403).json({ message: 'You are not part of this request thread' });
    }
    if (!canUserReply(concern, req.user.id)) {
      return res.status(403).json({
        message: 'Wait for the other party to respond before you can reply again',
      });
    }
    if (close && !isAssignee) {
      return res.status(403).json({ message: 'Only the assigned recipient can close this request' });
    }

    const messageAttachmentUrl = req.file ? `/uploads/concerns/${req.file.filename}` : null;
    await pool.query(
      `
      INSERT INTO concern_messages (concern_id, author_id, body, attachmenturl)
      VALUES ($1, $2, $3, $4)
    `,
      [id, req.user.id, response, messageAttachmentUrl]
    );

    const nextStatus = close ? 'Closed' : concern.status === 'Open' ? 'Responded' : 'Responded';
    const nextAwaiting = close ? null : isAssignee ? concern.raised_by : concern.raised_to;
    const responseAttachmentUrl = messageAttachmentUrl || concern.responseattachmenturl || null;
    const notifyUserId = isAssignee ? concern.raised_by : concern.raised_to;

    await pool.query(
      `
      UPDATE concerns
      SET status = $1,
          response = $2,
          responseattachmenturl = $3,
          responded_at = NOW(),
          awaiting_reply_from = $4
      WHERE id = $5
    `,
      [nextStatus, response, responseAttachmentUrl, nextAwaiting, id]
    );

    const notifyMessage = close
      ? `Your request "${concern.subject}" was closed with a response.`
      : isAssignee
        ? `Your request "${concern.subject}" has a new response — you can reply now.`
        : `Request "${concern.subject}" has a follow-up from the requester — you can reply now.`;

    await pool.query(
      `INSERT INTO notifications (userid, message, type, isread, subjectemployeeid) VALUES ($1, $2, 'concern_response', FALSE, $3)`,
      [notifyUserId, notifyMessage, req.user.id]
    );

    await logAudit(req.user.id, 'CONCERN_RESPONDED', 'concerns', { concernId: id, status: nextStatus, close });
    return res.json({
      message: close ? 'Request closed' : 'Response sent',
      status: nextStatus,
      awaitingReplyFrom: nextAwaiting,
    });
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
