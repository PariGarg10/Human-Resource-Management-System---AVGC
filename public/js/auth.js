const form = document.getElementById('loginForm');
const messageEl = document.getElementById('message');
const registerForm = document.getElementById('registerForm');
const registerMessage = document.getElementById('registerMessage');

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
  const name = String(employee?.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (name === 'ashish mishra') return '/admin/dashboard';
  return dashboardPathForRole(employee?.role);
}

// If already signed in, send user to the correct workspace
(function redirectIfAlreadySignedIn() {
  const token = localStorage.getItem('token');
  if (!token) return;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (!['/login', '/register'].includes(path)) return;
  try {
    const emp = JSON.parse(localStorage.getItem('employee') || '{}');
    window.location.replace(dashboardPathForEmployee(emp));
  } catch (_e) {}
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
        if (messageEl) messageEl.textContent = data.message || 'Login failed';
        return;
      }

      const employee = {
        ...data.employee,
        role: normalizeRole(data.employee?.role || 'employee'),
        adminId: data.employee?.adminId ?? null,
        isSuperAdmin: Boolean(data.employee?.isSuperAdmin),
        permissions: Array.isArray(data.employee?.permissions) ? data.employee.permissions : [],
        designation: data.employee?.designation || null,
      };
      localStorage.setItem('token', data.token);
      localStorage.setItem('employee', JSON.stringify(employee));
      window.location.href = dashboardPathForEmployee(employee);
    } catch (_error) {
      if (messageEl) messageEl.textContent = 'Network error while logging in';
    }
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (registerMessage) registerMessage.textContent = '';
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('regEmail').value.trim(),
          password: document.getElementById('regPassword').value.trim(),
          name: document.getElementById('regName').value.trim(),
        }),
      });
      const data = await response.json();
      if (registerMessage) {
        registerMessage.textContent = data.message || (response.ok ? 'Registered' : 'Registration failed');
      }
      if (response.ok) {
        setTimeout(() => {
          window.location.href = '/login';
        }, 1500);
      }
    } catch (_error) {
      if (registerMessage) registerMessage.textContent = 'Network error while registering';
    }
  });
}
