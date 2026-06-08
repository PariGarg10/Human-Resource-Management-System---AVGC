/** Central role identifiers — use these instead of hardcoded strings in routes/UI. */
const ROLES = Object.freeze({
  EMPLOYEE: 'employee',
  MANAGER: 'manager',
  ADMIN: 'admin',
  IT_HEAD: 'it_head',
  FOUNDER: 'founder',
});

const PORTAL_ROLES = Object.freeze({
  ADMIN: [ROLES.ADMIN, ROLES.FOUNDER, ROLES.IT_HEAD],
  MANAGER: [ROLES.MANAGER],
  EMPLOYEE: [ROLES.EMPLOYEE, ROLES.IT_HEAD],
});

function normalizeRole(role) {
  return String(role || '').toLowerCase().trim();
}

function isAdminRole(role) {
  const r = normalizeRole(role);
  return r === ROLES.ADMIN || r === ROLES.FOUNDER || r === ROLES.IT_HEAD;
}

function isManagerRole(role) {
  return normalizeRole(role) === ROLES.MANAGER;
}

function isEmployeeRole(role) {
  const r = normalizeRole(role);
  return r === ROLES.EMPLOYEE || r === ROLES.IT_HEAD;
}

module.exports = {
  ROLES,
  PORTAL_ROLES,
  normalizeRole,
  isAdminRole,
  isManagerRole,
  isEmployeeRole,
};
