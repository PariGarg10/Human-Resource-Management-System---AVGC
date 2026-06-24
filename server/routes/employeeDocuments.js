const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, enforceForcePasswordChange, requirePortalAdmin, isFounderUser } = require('../middleware/auth');
const { isAdminRole } = require('../constants/roles');
const { getUploadsRoot } = require('../utils/storagePaths');
const {
  EMPLOYEE_CATEGORIES,
  ADMIN_CATEGORIES,
  CATEGORY_LABELS,
  ensureEmployeeDocumentsTable,
  mapDocumentRow,
  isEmployeeCategory,
  isAdminCategory,
} = require('../utils/employeeDocuments');
const { syncProfileTask } = require('../utils/onboardingHelpers');

const router = express.Router();
const uploadDir = getUploadsRoot('employee-documents');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 16).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const okExt = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'].includes(ext);
    const okMime =
      /^application\/pdf$/i.test(file.mimetype) ||
      /^image\/(jpeg|png)$/i.test(file.mimetype) ||
      /^application\/msword$/i.test(file.mimetype) ||
      /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/i.test(
        file.mimetype
      );
    if (okExt || okMime) return cb(null, true);
    return cb(new Error('Only PDF, JPG, PNG, DOC, or DOCX files are allowed'));
  },
});

router.use(authMiddleware);
router.use(enforceForcePasswordChange);

function canAdminManage(user) {
  return Boolean(user?.adminId) || isAdminRole(user?.role) || isFounderUser(user);
}

async function listDocumentsForEmployee(employeeId) {
  const { rows } = await pool.query(
    `
      SELECT d.*, e.name AS uploaded_by_name
      FROM employee_documents d
      LEFT JOIN employees e ON e.id = d.uploaded_by
      WHERE d.employee_id = $1
      ORDER BY d.created_at DESC
    `,
    [employeeId]
  );
  return rows.map(mapDocumentRow);
}

/** GET my documents (employee uploads + admin uploads for me) */
router.get('/mine', async (req, res) => {
  try {
    await ensureEmployeeDocumentsTable();
    const docs = await listDocumentsForEmployee(req.user.id);
    const mine = docs.filter((d) => d.source === 'employee');
    const fromAdmin = docs.filter((d) => d.source === 'admin');
    return res.json({
      documents: docs,
      mine,
      fromAdmin,
      categories: CATEGORY_LABELS,
      employeeCategories: EMPLOYEE_CATEGORIES,
      adminCategories: ADMIN_CATEGORIES,
    });
  } catch (err) {
    console.error('GET /employee-documents/mine:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST upload my document */
router.post('/mine', upload.single('file'), async (req, res) => {
  try {
    await ensureEmployeeDocumentsTable();
    const category = String(req.body?.category || '').trim();
    if (!isEmployeeCategory(category)) {
      return res.status(400).json({ message: 'Invalid document category' });
    }
    if (!req.file) return res.status(400).json({ message: 'File is required' });

    const ins = await pool.query(
      `
        INSERT INTO employee_documents (
          employee_id, category, original_name, stored_name, mime_type, file_size, source, uploaded_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'employee', $7)
        RETURNING id
      `,
      [
        req.user.id,
        category,
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        req.user.id,
      ]
    );
    await syncProfileTask(req.user.id).catch(() => {});
    return res.status(201).json({ id: ins.rows[0].id, message: 'Document uploaded' });
  } catch (err) {
    console.error('POST /employee-documents/mine:', err.message);
    return res.status(400).json({ message: err.message || 'Upload failed' });
  }
});

/** GET admin overview — all employees with document counts */
router.get('/admin/overview', requirePortalAdmin, async (_req, res) => {
    try {
      await ensureEmployeeDocumentsTable();
      const { rows } = await pool.query(`
        SELECT
          e.id,
          e.employeecode,
          e.name,
          e.email,
          e.department,
          e.designation,
          COUNT(d.id)::int AS document_count
        FROM employees e
        LEFT JOIN employee_documents d ON d.employee_id = e.id
        WHERE COALESCE(e.isregistered, TRUE) = TRUE
        GROUP BY e.id
        ORDER BY e.name ASC
      `);
      return res.json({ employees: rows });
    } catch (err) {
      console.error('GET /employee-documents/admin/overview:', err.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

/** GET documents for a specific employee — admin */
router.get('/admin/employee/:employeeId', requirePortalAdmin, async (req, res) => {
    try {
      await ensureEmployeeDocumentsTable();
      const employeeId = Number(req.params.employeeId);
      if (!Number.isFinite(employeeId)) {
        return res.status(400).json({ message: 'Invalid employee id' });
      }
      const docs = await listDocumentsForEmployee(employeeId);
      return res.json({
        documents: docs,
        employeeCategories: EMPLOYEE_CATEGORIES,
        adminCategories: ADMIN_CATEGORIES,
        categories: CATEGORY_LABELS,
      });
    } catch (err) {
      console.error('GET /employee-documents/admin/employee:', err.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

/** POST admin upload for employee */
router.post('/admin/upload', requirePortalAdmin, upload.single('file'), async (req, res) => {
    try {
      await ensureEmployeeDocumentsTable();
      const employeeId = Number(req.body?.employeeId ?? req.body?.employee_id);
      const category = String(req.body?.category || '').trim();
      if (!Number.isFinite(employeeId)) {
        return res.status(400).json({ message: 'employeeId is required' });
      }
      if (!isAdminCategory(category)) {
        return res.status(400).json({ message: 'Invalid admin document category' });
      }
      if (!req.file) return res.status(400).json({ message: 'File is required' });

      const emp = await pool.query('SELECT id FROM employees WHERE id = $1', [employeeId]);
      if (!emp.rows[0]) return res.status(404).json({ message: 'Employee not found' });

      const ins = await pool.query(
        `
          INSERT INTO employee_documents (
            employee_id, category, original_name, stored_name, mime_type, file_size, source, uploaded_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'admin', $7)
          RETURNING id
        `,
        [
          employeeId,
          category,
          req.file.originalname,
          req.file.filename,
          req.file.mimetype,
          req.file.size,
          req.user.id,
        ]
      );
      return res.status(201).json({ id: ins.rows[0].id, message: 'Document uploaded for employee' });
    } catch (err) {
      console.error('POST /employee-documents/admin/upload:', err.message);
      return res.status(400).json({ message: err.message || 'Upload failed' });
    }
  }
);

/** GET download — owner or admin */
router.get('/:id/download', async (req, res) => {
  try {
    await ensureEmployeeDocumentsTable();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const { rows } = await pool.query('SELECT * FROM employee_documents WHERE id = $1', [id]);
    const doc = rows[0];
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const isOwner = doc.employee_id === req.user.id;
    if (!isOwner && !canAdminManage(req.user)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const filePath = path.join(uploadDir, doc.stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${String(doc.original_name || 'document').replace(/"/g, '')}"`
    );
    return res.sendFile(path.resolve(filePath));
  } catch (err) {
    console.error('GET /employee-documents/:id/download:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
