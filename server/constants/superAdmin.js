const SUPER_ADMIN_NAME = (process.env.SUPER_ADMIN_NAME || 'Super Admin').trim();
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'office@avgcstudios.com').trim().toLowerCase();
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';
const SUPER_ADMIN_DESIGNATION =
  (process.env.SUPER_ADMIN_DESIGNATION || 'Admin').trim();
const SUPER_ADMIN_DEPARTMENT = (process.env.SUPER_ADMIN_DEPARTMENT || 'Administration').trim();
const SUPER_ADMIN_EMPLOYEE_CODE = (process.env.SUPER_ADMIN_EMPLOYEE_CODE || 'EMP001').trim();

module.exports = {
  SUPER_ADMIN_NAME,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
  SUPER_ADMIN_DESIGNATION,
  SUPER_ADMIN_DEPARTMENT,
  SUPER_ADMIN_EMPLOYEE_CODE,
};
