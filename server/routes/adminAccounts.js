const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { authMiddleware, enforcePasswordChange } = require('../middleware/auth');
const { requireAdminAccess, requireSuperAdmin } = require('../middleware/adminAuth');
const { generateEmployeeCode, normalizeEmployeeCode, isValidEmployeeCode } = require('../utils/employeeCode');
const { logAudit } = require('../utils/audit');
const {
  ALL_MODULES,
  MODULE_LABELS,
  normalizeModuleList,
  replaceAdminPermissions,
  loadAdminPermissions,
} = require('../utils/adminPermissions');

const router = express.Router();

router.use(authMiddleware);
router.use(enforcePasswordChange);
router.use(requireAdminAccess);
router.use(requireSuperAdmin);

function adminToJson(row, permissions) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    designation: row.designation || '',
    department: row.department || '',
    employeecode: row.employeecode || '',
    isSuperAdmin: Boolean(row.is_super_admin),
    isActive: Boolean(row.is_active),
    employeeId: row.employee_id,
    createdAt: row.created_at,
    permissions: permissions || [],
  };
}

router.get('/modules', (_req, res) => {
  res.json({
    modules: ALL_MODULES.map((key) => ({ key, label: MODULE_LABELS[key] || key })),
  });
});

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT a.id, a.name, a.email, a.designation, a.department, a.is_super_admin, a.is_active,
               a.employee_id, a.created_at, e.employeecode
        FROM admins a
        LEFT JOIN employees e ON e.id = a.employee_id
        ORDER BY a.is_super_admin DESC, a.name ASC
      `
    );
    const admins = [];
    for (const row of rows) {
      const permissions = row.is_super_admin
        ? ALL_MODULES
        : await loadAdminPermissions(pool, row.id);
      admins.push(adminToJson(row, permissions));
    }
    return res.json({ admins });
  } catch (err) {
    console.error('GET /admin/accounts:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, password, designation, department, permissions, employeecode, dateOfJoining } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const existing = await pool.query('SELECT id FROM admins WHERE lower(trim(email)) = lower($1)', [email]);
    if (existing.rows[0]) {
      return res.status(409).json({ message: 'An admin with this email already exists' });
    }

    let code = normalizeEmployeeCode(employeecode);
    if (!code) {
      code = await generateEmployeeCode();
    } else if (!isValidEmployeeCode(code)) {
      return res.status(400).json({
        message: 'Employee code may only contain letters, numbers, hyphen, and underscore',
      });
    }

    const designationValue = designation != null ? String(designation).trim() || null : null;
    const dateOfJoiningRaw = dateOfJoining ?? req.body?.date_of_joining;
    const dateOfJoiningValue =
      dateOfJoiningRaw != null && String(dateOfJoiningRaw).trim()
        ? String(dateOfJoiningRaw).trim().slice(0, 10)
        : null;
    if (dateOfJoiningValue && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfJoiningValue)) {
      return res.status(400).json({ message: 'dateOfJoining must be YYYY-MM-DD' });
    }

    const codeTaken = await pool.query(
      'SELECT id FROM employees WHERE upper(trim(employeecode)) = upper($1) LIMIT 1',
      [code]
    );
    if (codeTaken.rows[0]) {
      return res.status(409).json({ message: 'Employee code already in use' });
    }

    const passwordhash = bcrypt.hashSync(String(password), 10);
    const empInsert = await pool.query(
      `
        INSERT INTO employees (
          employeecode, name, email, passwordhash, department, designation, date_of_joining,
          role, isregistered, mustchangepassword
        )
        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), 'admin', TRUE, FALSE)
        RETURNING id
      `,
      [code, name, email, passwordhash, department || null, designationValue, dateOfJoiningValue]
    );
    const employeeId = empInsert.rows[0].id;

    const adminInsert = await pool.query(
      `
        INSERT INTO admins (name, email, passwordhash, designation, department, is_super_admin, is_active, employee_id)
        VALUES ($1, $2, $3, $4, $5, FALSE, TRUE, $6)
        RETURNING id, name, email, designation, department, is_super_admin, is_active, employee_id, created_at
      `,
      [name, email, passwordhash, designation || null, department || null, employeeId]
    );
    const admin = adminInsert.rows[0];
    const normalized = normalizeModuleList(permissions);
    await replaceAdminPermissions(pool, admin.id, normalized);

    await logAudit(req.adminEmployeeId, 'ADMIN_CREATED', 'admins', { adminId: admin.id, email });
    return res.status(201).json({
      message: 'Admin created',
      admin: adminToJson(admin, normalized),
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Email or employee record already exists' });
    }
    console.error('POST /admin/accounts:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const adminId = Number(req.params.id);
    if (!Number.isFinite(adminId)) return res.status(400).json({ message: 'Invalid admin id' });

    const target = await pool.query(
      `
        SELECT a.*, e.employeecode AS linked_employeecode
        FROM admins a
        LEFT JOIN employees e ON e.id = a.employee_id
        WHERE a.id = $1
      `,
      [adminId]
    );
    const row = target.rows[0];
    if (!row) return res.status(404).json({ message: 'Admin not found' });

    const { name, designation, department, isActive, password, permissions, employeecode } = req.body;

    if (row.is_super_admin) {
      if (permissions != null || isActive === false) {
        return res.status(400).json({ message: 'Super Admin permissions and deactivation cannot be changed here' });
      }
    }

    let passwordhash = row.passwordhash;
    if (password && !row.is_super_admin) {
      passwordhash = bcrypt.hashSync(String(password), 10);
    }

    await pool.query(
      `
        UPDATE admins
        SET name = COALESCE($1, name),
            designation = COALESCE($2, designation),
            department = COALESCE($3, department),
            is_active = COALESCE($4, is_active),
            passwordhash = $5
        WHERE id = $6
      `,
      [
        name != null ? String(name).trim() : null,
        designation != null ? String(designation).trim() : null,
        department != null ? String(department).trim() : null,
        !row.is_super_admin && isActive != null ? Boolean(isActive) : null,
        passwordhash,
        adminId,
      ]
    );

    if (row.employee_id) {
      const employeeUpdates = [];
      const employeeParams = [];
      let paramIndex = 1;

      if (name != null) {
        employeeUpdates.push(`name = $${paramIndex++}`);
        employeeParams.push(String(name).trim());
      }
      if (department != null) {
        employeeUpdates.push(`department = $${paramIndex++}`);
        employeeParams.push(String(department).trim() || null);
      }
      if (designation != null) {
        employeeUpdates.push(`designation = $${paramIndex++}`);
        employeeParams.push(String(designation).trim() || null);
      }
      if (employeecode != null) {
        const code = normalizeEmployeeCode(employeecode);
        if (!code) {
          return res.status(400).json({ message: 'Employee code is required' });
        }
        if (!isValidEmployeeCode(code)) {
          return res.status(400).json({
            message: 'Employee code may only contain letters, numbers, hyphen, and underscore',
          });
        }
        const duplicateCode = await pool.query(
          `
            SELECT id FROM employees
            WHERE upper(trim(employeecode)) = upper($1) AND id <> $2
            LIMIT 1
          `,
          [code, row.employee_id]
        );
        if (duplicateCode.rows[0]) {
          return res.status(409).json({ message: `Employee code "${code}" is already in use` });
        }
        employeeUpdates.push(`employeecode = $${paramIndex++}`);
        employeeParams.push(code);
      }

      if (employeeUpdates.length) {
        employeeParams.push(row.employee_id);
        await pool.query(
          `UPDATE employees SET ${employeeUpdates.join(', ')} WHERE id = $${paramIndex}`,
          employeeParams
        );
      }
    }

    if (permissions != null && !row.is_super_admin) {
      await replaceAdminPermissions(pool, adminId, normalizeModuleList(permissions));
    }

    const updated = await pool.query(
      `
        SELECT a.id, a.name, a.email, a.designation, a.department, a.is_super_admin, a.is_active,
               a.employee_id, a.created_at, e.employeecode
        FROM admins a
        LEFT JOIN employees e ON e.id = a.employee_id
        WHERE a.id = $1
      `,
      [adminId]
    );
    const perms = row.is_super_admin
      ? ALL_MODULES
      : await loadAdminPermissions(pool, adminId);
    await logAudit(req.adminEmployeeId, 'ADMIN_UPDATED', 'admins', { adminId });
    return res.json({ message: 'Admin updated', admin: adminToJson(updated.rows[0], perms) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Employee code or email already in use' });
    }
    console.error('PATCH /admin/accounts/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const adminId = Number(req.params.id);
    const target = await pool.query('SELECT * FROM admins WHERE id = $1', [adminId]);
    const row = target.rows[0];
    if (!row) return res.status(404).json({ message: 'Admin not found' });
    if (row.is_super_admin) {
      return res.status(400).json({ message: 'Super Admin cannot be deleted' });
    }

    await pool.query('DELETE FROM admins WHERE id = $1', [adminId]);
    if (row.employee_id) {
      await pool.query('DELETE FROM employees WHERE id = $1', [row.employee_id]);
    }
    await logAudit(req.adminEmployeeId, 'ADMIN_DELETED', 'admins', { adminId });
    return res.json({ message: 'Admin deleted' });
  } catch (err) {
    console.error('DELETE /admin/accounts/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
