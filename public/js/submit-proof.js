import { api } from './api.js';
import { requireAuth } from './auth.js';
import { initTheme } from './theme.js';
import { renderNav } from './nav.js';

initTheme();
if (!requireAuth()) throw new Error('unauthed');
renderNav();

const requestId = new URLSearchParams(location.search).get('request');
if (!requestId) window.location.href = '/marketplace.html';

async function loadRequest() {
  const request = await api.get(`/api/requests/${requestId}`);

  document.getElementById('request-summary').innerHTML = `
    <div class="card card--surface" style="margin-bottom:var(--space-6)">
      <div class="card__header">
        <div>
          <div class="card__title">${esc(request.gameName)}</div>
          <span class="badge badge--accent" style="margin-top:var(--space-2)">${esc(request.promoType?.replace(/_/g,' '))}</span>
        </div>
        <span class="credit-chip credit-chip--value">${request.creditsOffered} cr</span>
      </div>
      ${request.description ? `<p class="card__body">${esc(request.description)}</p>` : ''}
    </div>
  `;
}

document.getElementById('proof-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const err = document.getElementById('form-error');
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const proofUrl = document.getElementById('proof-url').value.trim();
  const platform = document.getElementById('platform').value;

  try {
    await api.post('/api/claims', { requestId: Number(requestId), proofUrl, platform });
    window.location.href = `/dashboard.html?submitted=1`;
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false;
    btn.textContent = 'Submit proof';
  }
});

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

loadRequest().catch(console.error);
