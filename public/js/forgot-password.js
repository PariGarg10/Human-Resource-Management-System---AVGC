const form = document.getElementById('forgotPasswordForm');
const messageEl = document.getElementById('forgotMessage');
const submitBtn = document.getElementById('forgotSubmitBtn');

const SUCCESS_MSG = 'If this email exists, a reset link has been sent to your inbox';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  messageEl.textContent = '';
  messageEl.classList.remove('message-success', 'message-error');
  submitBtn.disabled = true;

  try {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('forgotEmail').value.trim() }),
    });
    const data = await response.json().catch(() => ({}));
    messageEl.textContent = data.message || SUCCESS_MSG;
    messageEl.classList.add('message-success');
    form.reset();
  } catch (_err) {
    messageEl.textContent = SUCCESS_MSG;
    messageEl.classList.add('message-success');
  } finally {
    submitBtn.disabled = false;
  }
});
