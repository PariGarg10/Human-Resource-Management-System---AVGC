const { PERMISSION_MODULES } = require('../utils/adminPermissions');

/** Holiday CRUD/import: Holiday Calendar module, or Settings (UI lives under Settings). */
function requireHolidayManage(req, res, next) {
  if (req.isSuperAdmin) return next();
  const perms = req.adminPermissions || [];
  if (
    perms.includes(PERMISSION_MODULES.HOLIDAY_CALENDAR) ||
    perms.includes(PERMISSION_MODULES.SETTINGS)
  ) {
    return next();
  }
  return res.status(403).json({
    message: 'Forbidden: Holiday Calendar or Settings permission required',
  });
}

module.exports = { requireHolidayManage };
