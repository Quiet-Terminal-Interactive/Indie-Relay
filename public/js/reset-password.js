import { api } from './api.js';
import { initTheme } from './theme.js';
import { renderNav } from './nav.js';

initTheme();
renderNav();

const token = new URLSearchParams(window.location.search).get('token');

if (!token) {
  document.getElementById('invalid-card').style.display = 'block';
} else {
  document.getElementById('reset-form').style.display = 'block';
}

document.getElementById('reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const err = document.getElementById('form-error');
  err.textContent = '';

  const password = document.getElementById('password').value;
  const confirm  = document.getElementById('confirm').value;

  if (!password)            { err.textContent = 'Enter a new password.'; return; }
  if (password.length < 8)  { err.textContent = 'Password must be at least 8 characters.'; return; }
  if (password !== confirm)  { err.textContent = 'Passwords do not match.'; return; }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    await api.post('/api/auth/reset-password', { token, newPassword: password });
    document.getElementById('reset-form').style.display = 'none';
    document.getElementById('success-card').style.display = 'block';
  } catch (ex) {
    const msg = ex.message ?? '';
    if (msg.includes('invalid') || msg.includes('expired')) {
      document.getElementById('reset-form').style.display = 'none';
      document.getElementById('invalid-card').style.display = 'block';
    } else {
      err.textContent = msg || 'Something went wrong. Please try again.';
      btn.disabled = false;
      btn.textContent = 'Set new password';
    }
  }
});
