const SUPER_ADMIN_NAME = (process.env.SUPER_ADMIN_NAME || 'Ashish Mishra').trim();
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'admin@hrms.com').trim().toLowerCase();
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';
const SUPER_ADMIN_DESIGNATION =
  (process.env.SUPER_ADMIN_DESIGNATION || 'Founder & CEO').trim();
const SUPER_ADMIN_DEPARTMENT = (process.env.SUPER_ADMIN_DEPARTMENT || 'Administration').trim();
const SUPER_ADMIN_EMPLOYEE_CODE = (process.env.SUPER_ADMIN_EMPLOYEE_CODE || '1001').trim();

module.exports = {
  SUPER_ADMIN_NAME,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
  SUPER_ADMIN_DESIGNATION,
  SUPER_ADMIN_DEPARTMENT,
  SUPER_ADMIN_EMPLOYEE_CODE,
};
