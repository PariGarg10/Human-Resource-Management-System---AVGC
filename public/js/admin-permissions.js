/**
 * Admin dashboard RBAC — sidebar visibility and route guards.
 */
(function () {
  const MODULE = {
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

  const NAV_PERMISSIONS = {
    dashboard: MODULE.DASHBOARD_OVERVIEW,
    calendar: MODULE.ATTENDANCE,
    'holiday-calendar': MODULE.HOLIDAY_CALENDAR,
    employees: MODULE.EMPLOYEE_MANAGEMENT,
    managers: MODULE.EMPLOYEE_MANAGEMENT,
    'org-chart': MODULE.EMPLOYEE_MANAGEMENT,
    attendance: MODULE.ATTENDANCE,
    leaves: MODULE.LEAVE_MANAGEMENT,
    'leave-entitlements': MODULE.LEAVE_MANAGEMENT,
    'import-employees': MODULE.IMPORT_DATA,
    'import-attendance': MODULE.IMPORT_DATA,
    reports: MODULE.REPORTS_EXPORT,
    roles: MODULE.ROLE_MANAGEMENT,
    system: MODULE.SETTINGS,
    'office-location': MODULE.SETTINGS,
    broadcast: MODULE.SETTINGS,
    biometric: MODULE.SETTINGS,
    assignments: MODULE.EMPLOYEE_MANAGEMENT,
    'requests-inbox': MODULE.REQUEST_APPROVALS,
    'requests-all': MODULE.REQUEST_APPROVALS,
    'manage-admins': null,
  };

  const ALWAYS_VISIBLE = new Set(['my-tasks', 'punch', 'profile', 'requests-raise', 'requests-my', 'not-authorized']);

  function readAdminUser() {
    try {
      return JSON.parse(localStorage.getItem('employee') || '{}');
    } catch {
      return {};
    }
  }

  function isSuperAdmin(user) {
    return Boolean(user?.isSuperAdmin);
  }

  function getPermissions(user) {
    if (isSuperAdmin(user)) return Object.values(MODULE);
    return Array.isArray(user?.permissions) ? user.permissions : [];
  }

  function canAccessSection(section, user) {
    if (!section) return false;
    if (ALWAYS_VISIBLE.has(section)) return true;
    if (section === 'manage-admins') return isSuperAdmin(user);
    const required = NAV_PERMISSIONS[section];
    if (!required) return true;
    return getPermissions(user).includes(required);
  }

  function persistAdminUser(patch) {
    const user = { ...readAdminUser(), ...patch };
    localStorage.setItem('employee', JSON.stringify(user));
    return user;
  }

  function applySidebarPermissions(user) {
    document.querySelectorAll('.sidebar-nav [data-nav]').forEach((el) => {
      const section = el.getAttribute('data-nav');
      const allowed = canAccessSection(section, user);
      el.style.display = allowed ? '' : 'none';
    });
    document.querySelectorAll('.sidebar-nav a[href="/managers"]').forEach((el) => {
      el.style.display = getPermissions(user).includes(MODULE.EMPLOYEE_MANAGEMENT) ? '' : 'none';
    });
    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return;
    const children = [...nav.children];
    children.forEach((el, i) => {
      if (!el.classList.contains('sidebar-nav-group-label') && !el.classList.contains('sidebar-nav-divider')) return;
      let hasVisible = false;
      for (let j = i + 1; j < children.length; j++) {
        const next = children[j];
        if (next.classList.contains('sidebar-nav-group-label') || next.classList.contains('sidebar-nav-divider')) break;
        if ((next.matches('[data-nav]') || next.matches('a[href]')) && next.style.display !== 'none') {
          hasVisible = true;
          break;
        }
      }
      el.style.display = hasVisible ? '' : 'none';
    });
  }

  function showNotAuthorized() {
    document.querySelectorAll('.view-section').forEach((v) => v.classList.remove('is-active'));
    const view = document.getElementById('view-not-authorized');
    if (view) view.classList.add('is-active');
    const bc = document.getElementById('breadcrumbCurrent');
    if (bc) bc.textContent = 'Not Authorized';
  }

  function guardNavigation(section, user, onAllowed) {
    if (canAccessSection(section, user)) {
      if (typeof onAllowed === 'function') onAllowed(section);
      return true;
    }
    showNotAuthorized();
    return false;
  }

  async function refreshSession(apiFn) {
    const data = await apiFn('/api/admin/session');
    return persistAdminUser({
      isSuperAdmin: data.isSuperAdmin,
      permissions: data.permissions || [],
      designation: data.admin?.designation,
      department: data.admin?.department,
    });
  }

  window.HRMS_ADMIN_PERMS = {
    MODULE,
    NAV_PERMISSIONS,
    readAdminUser,
    isSuperAdmin,
    getPermissions,
    canAccessSection,
    persistAdminUser,
    applySidebarPermissions,
    showNotAuthorized,
    guardNavigation,
    refreshSession,
  };
})();
