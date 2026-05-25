const form = document.getElementById('resetPasswordForm');
const messageEl = document.getElementById('resetMessage');
const submitBtn = document.getElementById('resetSubmitBtn');

const params = new URLSearchParams(window.location.search);
const token = params.get('token');

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.classList.remove('message-success', 'message-error');
  if (type) messageEl.classList.add(type === 'success' ? 'message-success' : 'message-error');
}

function validateClientPassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-zA-Z]/.test(password)) return 'Password must include at least one letter';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number';
  return null;
}

if (!token) {
  showMessage('This link is invalid or has expired. Please request a new one.', 'error');
  form.querySelectorAll('input, button').forEach((el) => {
    el.disabled = true;
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!token) return;

  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword !== confirmPassword) {
    showMessage('Passwords do not match.', 'error');
    return;
  }

  const clientError = validateClientPassword(newPassword);
  if (clientError) {
    showMessage(clientError, 'error');
    return;
  }

  submitBtn.disabled = true;
  showMessage('', null);

  try {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showMessage(
        data.message || 'This link is invalid or has expired. Please request a new one.',
        'error'
      );
      return;
    }

    showMessage('Password reset successful. Please login.', 'success');
    form.reset();
    form.querySelectorAll('input, button').forEach((el) => {
      el.disabled = true;
    });
    setTimeout(() => {
      window.location.href = '/login';
    }, 2500);
  } catch (_err) {
    showMessage('Network error. Please try again.', 'error');
    submitBtn.disabled = false;
  }
});
