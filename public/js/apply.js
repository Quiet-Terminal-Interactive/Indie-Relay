import { api } from './api.js';
import { setSession, redirectIfAuthed } from './auth.js';
import { initTheme } from './theme.js';
import { renderNav } from './nav.js';

initTheme();
renderNav();
redirectIfAuthed();

const memberTypeEl = document.getElementById('member-type');
const verificationSection = document.getElementById('verification-section');
const oauthSection = document.getElementById('oauth-section');
const urlSection = document.getElementById('url-section');
const verificationHint = document.getElementById('verification-hint');

const OAUTH_TYPES = new Set(['creator', 'streamer']);
const URL_HINTS = {
  dev: "Link to your studio website or itch.io page.",
  press: "Link to your publication or a recent byline.",
};

let oauthVerificationId = null;
let oauthPlatform = null;
let oauthUsername = null;

(async function initOauth() {
  const params = new URLSearchParams(window.location.search);

  if (params.get('oauth_error')) {
    const reason = params.get('oauth_error');
    const msg = reason === 'cancelled' ? 'Connection cancelled.' : 'Could not connect your account. Please try again.';
    document.getElementById('form-error').textContent = msg;
    restoreFormFromSession();
    return;
  }

  if (params.get('verificationId')) {
    const returnedState = params.get('state');
    const savedState = sessionStorage.getItem('oauth_state');

    if (!returnedState || returnedState !== savedState) {
      document.getElementById('form-error').textContent = 'OAuth state mismatch. Please try again.';
      restoreFormFromSession();
      return;
    }

    oauthVerificationId = params.get('verificationId');
    oauthPlatform = params.get('platform');
    oauthUsername = params.get('username');

    restoreFormFromSession();
    showOauthVerified();
    return;
  }

  const available = await api.get('/api/auth/oauth/providers').catch(() => []);
  for (const provider of available) {
    const btn = document.getElementById(`btn-${provider}`);
    if (btn) btn.style.display = '';
  }
})();

function restoreFormFromSession() {
  const saved = JSON.parse(sessionStorage.getItem('apply_form') ?? 'null');
  if (!saved) return;
  if (saved.name) document.getElementById('name').value = saved.name;
  if (saved.email) document.getElementById('email').value = saved.email;
  if (saved.memberType) {
    memberTypeEl.value = saved.memberType;
    memberTypeEl.dispatchEvent(new Event('change'));
  }
  if (saved.inviteCode) document.getElementById('invite-code').value = saved.inviteCode;
  sessionStorage.removeItem('apply_form');
}

function showOauthVerified() {
  const banner = document.getElementById('oauth-verified-banner');
  const text = document.getElementById('oauth-verified-text');
  const buttons = document.getElementById('oauth-buttons');
  const platformLabel = oauthPlatform.charAt(0).toUpperCase() + oauthPlatform.slice(1);
  text.textContent = `Connected as ${oauthUsername} on ${platformLabel}`;
  banner.style.display = 'block';
  buttons.style.display = 'none';
}

document.getElementById('oauth-disconnect')?.addEventListener('click', () => {
  oauthVerificationId = null;
  oauthPlatform = null;
  oauthUsername = null;
  document.getElementById('oauth-verified-banner').style.display = 'none';
  document.getElementById('oauth-buttons').style.display = 'flex';
});

memberTypeEl.addEventListener('change', () => {
  const type = memberTypeEl.value;
  verificationSection.style.display = type ? 'block' : 'none';

  if (OAUTH_TYPES.has(type)) {
    oauthSection.style.display = 'block';
    urlSection.style.display = 'none';
    if (oauthVerificationId) showOauthVerified();
  } else {
    oauthSection.style.display = 'none';
    urlSection.style.display = 'block';
    verificationHint.textContent = URL_HINTS[type] ?? '';
  }
});

document.getElementById('oauth-buttons').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-provider]');
  if (!btn) return;

  const provider = btn.dataset.provider;
  const state = crypto.randomUUID();
  sessionStorage.setItem('oauth_state', state);

  sessionStorage.setItem('apply_form', JSON.stringify({
    name: document.getElementById('name').value,
    email: document.getElementById('email').value,
    memberType: memberTypeEl.value,
    inviteCode: document.getElementById('invite-code').value,
  }));

  window.location.href = `/api/auth/oauth/${provider}/start?state=${state}`;
});

document.getElementById('apply-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const err = document.getElementById('form-error');
  err.textContent = '';

  const name     = document.getElementById('name').value.trim();
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const type     = memberTypeEl.value;

  if (!name)                             { err.textContent = 'Name is required.'; return; }
  if (!email || !email.includes('@'))    { err.textContent = 'Enter a valid email address.'; return; }
  if (!password || password.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
  if (!type)                             { err.textContent = 'Select your member type.'; return; }
  if (!document.getElementById('privacy-agree').checked) { err.textContent = 'You must agree to the privacy notice to apply.'; return; }

  let verificationUrl;
  if (OAUTH_TYPES.has(type)) {
    if (!oauthVerificationId) {
      const fallback = document.getElementById('verification-url')?.value.trim();
      if (!fallback) { err.textContent = 'Please connect a platform account or paste your profile URL.'; return; }
      verificationUrl = fallback;
    }
  } else {
    verificationUrl = document.getElementById('verification-url-plain')?.value.trim() || undefined;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const data = await api.post('/api/auth/signup', {
      email,
      password,
      name,
      memberType: type,
      verificationUrl,
      inviteCode: document.getElementById('invite-code').value.trim() || undefined,
      ...(oauthVerificationId ? { oauthVerificationId } : {}),
    });
    setSession(data.token, { memberId: data.memberId, isCommittee: false });
    window.location.href = '/dashboard.html?welcome=1';
  } catch (ex) {
    err.textContent = ex.message ?? 'Application failed. Please try again.';
    btn.disabled = false;
    btn.textContent = 'Apply for membership';
  }
});
