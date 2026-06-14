import { api } from './api.js';
import { setSession, redirectIfAuthed } from './auth.js';
import { initTheme } from './theme.js';

initTheme();
redirectIfAuthed();

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const err = document.getElementById('form-error');
  err.textContent = '';

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !email.includes('@')) { err.textContent = 'Enter a valid email address.'; return; }
  if (!password)                       { err.textContent = 'Password is required.'; return; }

  btn.disabled = true;
  btn.textContent = 'Logging in…';

  try {
    const data = await api.post('/api/auth/login', {
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    });
    setSession(data.token, { memberId: data.memberId, isCommittee: data.isCommittee });
    window.location.href = '/dashboard.html';
  } catch (ex) {
    err.textContent = ex.message ?? 'Login failed. Check your email and password.';
    btn.disabled = false;
    btn.textContent = 'Log in';
  }
});
