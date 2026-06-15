import { api } from './api.js';
import { initTheme } from './theme.js';
import { renderNav } from './nav.js';

initTheme();
renderNav();

document.getElementById('forgot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const err = document.getElementById('form-error');
  err.textContent = '';

  const email = document.getElementById('email').value.trim();
  if (!email || !email.includes('@')) {
    err.textContent = 'Enter a valid email address.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    await api.post('/api/auth/forgot-password', { email });
    document.getElementById('forgot-form').style.display = 'none';
    document.getElementById('success-card').style.display = 'block';
  } catch {
    err.textContent = 'Something went wrong. Please try again.';
    btn.disabled = false;
    btn.textContent = 'Send reset link';
  }
});
