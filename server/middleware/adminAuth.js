const { pool } = require('../db');
const { isFounderUser } = require('./auth');
const { loadAdminPermissions, ALL_MODULES } = require('../utils/adminPermissions');

async function resolveAdminContext(user) {
  if (!user?.id && !user?.adminId) return null;

  if (user.adminId) {
    const result = await pool.query(
      `
        SELECT id, name, email, designation, department, is_super_admin, is_active, employee_id, mustchangepassword
        FROM admins
        WHERE id = $1
      `,
      [user.adminId]
    );
    const admin = result.rows[0];
    if (!admin || !admin.is_active) return null;
    const permissions = admin.is_super_admin
      ? ALL_MODULES
      : await loadAdminPermissions(pool, admin.id);
    return {
      admin,
      isSuperAdmin: Boolean(admin.is_super_admin),
      permissions,
      employeeId: admin.employee_id || user.id,
    };
  }

  const empResult = await pool.query(
    'SELECT id, name, email, role, department FROM employees WHERE id = $1',
    [user.id]
  );
  const employee = empResult.rows[0];
  if (!employee) return null;

  const role = String(employee.role || '').toLowerCase().trim();
  if (role !== 'admin' && !isFounderUser(employee)) return null;

  const linked = await pool.query('SELECT id, is_super_admin, is_active, employee_id FROM admins WHERE employee_id = $1', [
    employee.id,
  ]);
  if (linked.rows[0]) {
    const admin = linked.rows[0];
    if (!admin.is_active) return null;
    const full = await pool.query(
      'SELECT id, name, email, designation, department, is_super_admin, is_active, employee_id, mustchangepassword FROM admins WHERE id = $1',
      [admin.id]
    );
    const row = full.rows[0];
    const permissions = row.is_super_admin ? ALL_MODULES : await loadAdminPermissions(pool, row.id);
    return {
      admin: row,
      isSuperAdmin: Boolean(row.is_super_admin),
      permissions,
      employeeId: row.employee_id,
    };
  }

  if (isFounderUser(employee)) {
    return {
      admin: {
        id: null,
        name: employee.name,
        email: employee.email,
        designation: 'Founder',
        department: employee.department,
        is_super_admin: true,
        is_active: true,
        employee_id: employee.id,
        mustchangepassword: Boolean(user.mustchangepassword),
      },
      isSuperAdmin: true,
      permissions: ALL_MODULES,
      employeeId: employee.id,
    };
  }

  return null;
}

async function requireAdminAccess(req, res, next) {
  try {
    const ctx = await resolveAdminContext(req.user);
    if (!ctx) {
      return res.status(403).json({ message: 'Forbidden: admin access required' });
    }
    req.adminAccount = ctx.admin;
    req.isSuperAdmin = ctx.isSuperAdmin;
    req.adminPermissions = ctx.permissions;
    req.adminEmployeeId = ctx.employeeId;
    req.currentUser = { id: ctx.employeeId, name: ctx.admin.name, role: 'admin' };
    return next();
  } catch (err) {
    console.error('requireAdminAccess:', err.message);
    return res.status(500).json({
      message: 'Admin authorization failed. Ensure database migrations are applied (npm run db:init).',
      detail: err.message,
    });
  }
}

function requireSuperAdmin(req, res, next) {
  if (req.isSuperAdmin) return next();
  return res.status(403).json({ message: 'Forbidden: super admin only' });
}

module.exports = { requireAdminAccess, requireSuperAdmin, resolveAdminContext };
