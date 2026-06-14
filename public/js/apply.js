import { api } from './api.js';
import { setSession, redirectIfAuthed } from './auth.js';
import { initTheme } from './theme.js';

initTheme();
redirectIfAuthed();

const memberType = document.getElementById('member-type');
const verificationSection = document.getElementById('verification-section');
const verificationHint = document.getElementById('verification-hint');

const HINTS = {
  dev: 'Link to your studio website or itch.io page to confirm you\'re an active developer.',
  press: 'Link to your publication, plus a note that someone senior there can vouch for you.',
  creator: 'Your YouTube/Twitch/TikTok profile URL — we\'ll verify it\'s yours.',
  streamer: 'Your Twitch or YouTube channel URL.',
};

memberType.addEventListener('change', () => {
  verificationSection.style.display = memberType.value ? 'block' : 'none';
  verificationHint.textContent = HINTS[memberType.value] ?? '';
});

document.getElementById('apply-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const err = document.getElementById('form-error');
  err.textContent = '';

  const name       = document.getElementById('name').value.trim();
  const email      = document.getElementById('email').value.trim();
  const password   = document.getElementById('password').value;
  const type       = memberType.value;

  if (!name)                             { err.textContent = 'Name is required.'; return; }
  if (!email || !email.includes('@'))    { err.textContent = 'Enter a valid email address.'; return; }
  if (!password || password.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
  if (!type)                             { err.textContent = 'Select your member type.'; return; }
  if (!document.getElementById('privacy-agree').checked) { err.textContent = 'You must agree to the privacy notice to apply.'; return; }

  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const data = await api.post('/api/auth/signup', {
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
      name: document.getElementById('name').value.trim(),
      memberType: memberType.value,
      verificationUrl: document.getElementById('verification-url').value.trim() || undefined,
      inviteCode: document.getElementById('invite-code').value.trim() || undefined,
    });
    setSession(data.token, { memberId: data.memberId, isCommittee: false });
    window.location.href = '/dashboard.html?welcome=1';
  } catch (ex) {
    err.textContent = ex.message ?? 'Application failed. Please try again.';
    btn.disabled = false;
    btn.textContent = 'Apply for membership';
  }
});
