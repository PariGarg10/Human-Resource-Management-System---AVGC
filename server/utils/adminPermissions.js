/** Admin dashboard permission module keys (stored in admin_permissions.module_name). */
const PERMISSION_MODULES = {
  EMPLOYEE_MANAGEMENT: 'employee_management',
  ATTENDANCE: 'attendance',
  LEAVE_MANAGEMENT: 'leave_management',
  REPORTS_EXPORT: 'reports_export',
  HOLIDAY_CALENDAR: 'holiday_calendar',
  ROLE_MANAGEMENT: 'role_management',
  IMPORT_DATA: 'import_data',
  SETTINGS: 'settings',
  REQUEST_APPROVALS: 'request_approvals',
  DASHBOARD_OVERVIEW: 'dashboard_overview',
};

const ALL_MODULES = Object.values(PERMISSION_MODULES);

const MODULE_LABELS = {
  [PERMISSION_MODULES.EMPLOYEE_MANAGEMENT]: 'Employee Management',
  [PERMISSION_MODULES.ATTENDANCE]: 'Attendance',
  [PERMISSION_MODULES.LEAVE_MANAGEMENT]: 'Leave Management',
  [PERMISSION_MODULES.REPORTS_EXPORT]: 'Reports & Export',
  [PERMISSION_MODULES.HOLIDAY_CALENDAR]: 'Holiday Calendar',
  [PERMISSION_MODULES.ROLE_MANAGEMENT]: 'Role Management',
  [PERMISSION_MODULES.IMPORT_DATA]: 'Import Data',
  [PERMISSION_MODULES.SETTINGS]: 'Settings',
  [PERMISSION_MODULES.REQUEST_APPROVALS]: 'Request Approvals',
  [PERMISSION_MODULES.DASHBOARD_OVERVIEW]: 'Dashboard Overview',
};

function normalizeModuleList(input) {
  if (!Array.isArray(input)) return [];
  const allowed = new Set(ALL_MODULES);
  return [...new Set(input.map((m) => String(m).trim()).filter((m) => allowed.has(m)))];
}

function permissionsFromRows(rows) {
  if (!rows?.length) return [];
  return rows.filter((r) => r.can_access).map((r) => r.module_name);
}

async function loadAdminPermissions(pool, adminId) {
  try {
    const { rows } = await pool.query(
      `
        SELECT module_name, can_access
        FROM admin_permissions
        WHERE admin_id = $1 AND can_access = TRUE
      `,
      [adminId]
    );
    return permissionsFromRows(rows);
  } catch (err) {
    if (err.code === '42P01') {
      console.warn('[adminPermissions] admin_permissions table missing — run npm run db:init');
      return [];
    }
    throw err;
  }
}

async function replaceAdminPermissions(pool, adminId, modules) {
  const normalized = normalizeModuleList(modules);
  await pool.query('DELETE FROM admin_permissions WHERE admin_id = $1', [adminId]);
  if (!normalized.length) return;
  const values = [];
  const params = [];
  normalized.forEach((moduleName, index) => {
    const base = index * 3;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    params.push(adminId, moduleName, true);
  });
  await pool.query(
    `
      INSERT INTO admin_permissions (admin_id, module_name, can_access)
      VALUES ${values.join(', ')}
    `,
    params
  );
}

function hasPermission(req, moduleName) {
  if (req.isSuperAdmin) return true;
  const perms = req.adminPermissions || [];
  return perms.includes(moduleName);
}

function requirePermission(moduleName) {
  return (req, res, next) => {
    if (hasPermission(req, moduleName)) return next();
    return res.status(403).json({ message: 'Forbidden: insufficient permissions for this module' });
  };
}

module.exports = {
  PERMISSION_MODULES,
  ALL_MODULES,
  MODULE_LABELS,
  normalizeModuleList,
  loadAdminPermissions,
  replaceAdminPermissions,
  hasPermission,
  requirePermission,
};
