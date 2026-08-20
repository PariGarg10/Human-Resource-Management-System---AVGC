const form = document.getElementById('loginForm');
const messageEl = document.getElementById('message');

function normalizeRole(role) {
  return String(role || 'employee').toLowerCase().trim();
}

function dashboardPathForRole(role) {
  const r = normalizeRole(role);
  if (r === 'admin' || r === 'founder') return '/admin/dashboard';
  if (r === 'manager') return '/manager/dashboard';
  if (r === 'it_head') return '/employee/dashboard';
  return '/employee/dashboard';
}

function dashboardPathForEmployee(employee) {
  if (employee?.isSuperAdmin || employee?.adminId) return '/admin/dashboard';
  const name = String(employee?.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (name === 'ashish mishra') return '/admin/dashboard';
  return dashboardPathForRole(employee?.role);
}

// If already signed in with a valid token, send user to the correct workspace
(function redirectIfAlreadySignedIn() {
  const token = localStorage.getItem('token');
  if (!token) return;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path !== '/login') return;
  const tokenAtStart = token;
  fetch('/api/auth/me', { headers: { Authorization: `Bearer ${tokenAtStart}` } })
    .then((res) => {
      // Ignore stale response if user signed in again while this request was in flight
      if (localStorage.getItem('token') !== tokenAtStart) return null;
      if (!res.ok) {
        localStorage.removeItem('token');
        localStorage.removeItem('employee');
        return null;
      }
      return res.json();
    })
    .then((me) => {
      if (!me) return;
      if (localStorage.getItem('token') !== tokenAtStart) return;
      try {
        const stored = JSON.parse(localStorage.getItem('employee') || '{}');
        const emp = {
          ...stored,
          role: normalizeRole(me.role || stored.role || 'employee'),
          adminId: me.adminId ?? stored.adminId ?? null,
          isSuperAdmin: Boolean(me.isSuperAdmin ?? stored.isSuperAdmin),
          permissions: Array.isArray(me.permissions) ? me.permissions : stored.permissions || [],
        };
        localStorage.setItem('employee', JSON.stringify(emp));
        window.location.replace(dashboardPathForEmployee(emp));
      } catch (_e) {}
    })
    .catch(() => {});
})();

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const email = formData.get('email');
    const password = formData.get('password');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        const msg =
          response.status === 429
            ? data.message || 'Too many login attempts from your network. Wait a minute and try again.'
            : data.message || 'Login failed';
        if (messageEl) messageEl.textContent = msg;
        if (window.HRMS?.toast) window.HRMS.toast(msg, 'error');
        return;
      }

      const employee = {
        ...data.employee,
        role: normalizeRole(data.employee?.role || 'employee'),
        adminId: data.employee?.adminId ?? null,
        isSuperAdmin: Boolean(data.employee?.isSuperAdmin),
        permissions: Array.isArray(data.employee?.permissions) ? data.employee.permissions : [],
        designation: data.employee?.designation || null,
        isFirstLogin: data.employee?.isFirstLogin === true,
        onboardingCompleted: data.employee?.onboardingCompleted === true,
      };
      localStorage.setItem('token', data.token);
      localStorage.setItem('employee', JSON.stringify(employee));
      window.location.href = dashboardPathForEmployee(employee);
    } catch (_error) {
      if (messageEl) messageEl.textContent = 'Network error while logging in';
    }
  });
}
