const form = document.getElementById('loginForm');
const messageEl = document.getElementById('message');
const registerForm = document.getElementById('registerForm');
const registerMessage = document.getElementById('registerMessage');
const forgotForm = document.getElementById('forgotForm');
const forgotMessage = document.getElementById('forgotMessage');

function dashboardPathForRole(role) {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'manager') return '/manager/dashboard';
  return '/employee/dashboard';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const email = formData.get('email');
  const password = formData.get('password');

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      messageEl.textContent = data.message || 'Login failed';
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('employee', JSON.stringify(data.employee));
    const role = data.employee.role || 'employee';
    window.location.href = dashboardPathForRole(role);
  } catch (error) {
    messageEl.textContent = 'Network error while logging in';
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerMessage.textContent = '';
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('regEmail').value.trim(),
        password: document.getElementById('regPassword').value.trim(),
        name: document.getElementById('regName').value.trim()
      })
    });
    const data = await response.json();
    registerMessage.textContent = data.message || (response.ok ? 'Registered' : 'Registration failed');
  } catch (_error) {
    registerMessage.textContent = 'Network error while registering';
  }
});

forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  forgotMessage.textContent = '';
  try {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('forgotEmail').value.trim() })
    });
    const data = await response.json();
    forgotMessage.textContent = data.temporarypassword
      ? `${data.message} Temporary password: ${data.temporarypassword}`
      : (data.message || 'If account exists, reset is initiated');
  } catch (_error) {
    forgotMessage.textContent = 'Network error while resetting password';
  }
});
