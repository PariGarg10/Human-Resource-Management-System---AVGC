/** Send linked admin / super-admin users to the admin portal (even with legacy manager tokens). */
(function portalAdminRedirect() {
  var path = (window.location.pathname || '').replace(/\/$/, '') || '/';
  if (path.indexOf('/admin/dashboard') === 0 || path === '/login') return;

  var token = localStorage.getItem('token');
  if (!token) return;

  try {
    var stored = JSON.parse(localStorage.getItem('employee') || '{}');
    if (stored.isSuperAdmin || stored.adminId || String(stored.role || '').toLowerCase() === 'admin') {
      window.location.replace('/admin/dashboard');
      return;
    }
  } catch (_e) {}

  fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (me) {
      if (!me) return;
      if (!(me.adminId || me.isSuperAdmin || String(me.role || '').toLowerCase() === 'admin')) return;
      try {
        var emp = JSON.parse(localStorage.getItem('employee') || '{}');
        emp.role = me.role || 'admin';
        emp.adminId = me.adminId ?? emp.adminId ?? null;
        emp.isSuperAdmin = Boolean(me.isSuperAdmin);
        if (Array.isArray(me.permissions)) emp.permissions = me.permissions;
        localStorage.setItem('employee', JSON.stringify(emp));
      } catch (_e2) {}
      window.location.replace('/admin/dashboard');
    })
    .catch(function () {});
})();
