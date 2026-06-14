import { api } from './api.js';
import { requireAuth } from './auth.js';
import { initTheme } from './theme.js';
import { renderNav } from './nav.js';

initTheme();
if (!requireAuth()) throw new Error('unauthed');
renderNav();

const PROMO_LABELS = {
  social_shoutout: 'Social shoutout',
  community_crosspost: 'Cross-post',
  short_form_video: 'Short-form video',
  livestream: 'Livestream',
  long_form_video: 'Long-form video',
  press_feature: 'Press feature',
};

const grid = document.getElementById('request-grid');
const filterType = document.getElementById('filter-type');
const filterMin = document.getElementById('filter-min');
const filterMax = document.getElementById('filter-max');

async function loadRequests() {
  grid.innerHTML = `<div style="grid-column:1/-1"><div class="spinner" style="margin:auto"></div></div>`;

  const params = new URLSearchParams();
  if (filterType.value) params.set('type', filterType.value);
  if (filterMin.value) params.set('minCredits', filterMin.value);
  if (filterMax.value) params.set('maxCredits', filterMax.value);

  const requests = await api.get(`/api/requests?${params}`);

  if (requests.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state__icon">📭</div>
        <div class="empty-state__title">No open requests</div>
        <p>Check back soon or <a href="/new-request.html">post your own</a>.</p>
      </div>`;
    return;
  }

  grid.innerHTML = requests.map(r => `
    <div class="card fade-up">
      <div class="card__header">
        <div>
          <div class="card__title">${esc(r.gameName)}</div>
          <div style="font-size:var(--text-xs);color:var(--ir-text-muted);margin-top:var(--space-1)">
            by ${esc(r.requesterName)} · ${daysAgo(r.createdAt)}
          </div>
        </div>
        <span class="credit-chip credit-chip--value">${r.creditsOffered} cr</span>
      </div>
      <div style="margin-bottom:var(--space-3)">
        <span class="badge badge--accent">${esc(PROMO_LABELS[r.promoType] ?? r.promoType)}</span>
      </div>
      ${r.description ? `<p class="card__body" style="margin-bottom:var(--space-4)">${esc(r.description)}</p>` : ''}
      <div class="card__footer" style="display:flex;gap:var(--space-2);align-items:center">
        ${r.gameUrl ? `<a href="${esc(r.gameUrl)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">View game</a>` : ''}
        <a href="/submit-proof.html?request=${r.id}" class="btn btn--primary btn--sm" style="margin-left:auto">
          Claim &amp; promote
        </a>
      </div>
    </div>
  `).join('');
}

[filterType, filterMin, filterMax].forEach(el => el.addEventListener('change', loadRequests));

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function daysAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

loadRequests().catch(console.error);
