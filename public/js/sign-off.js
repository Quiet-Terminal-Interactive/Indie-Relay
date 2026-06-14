import { api } from './api.js';
import { requireAuth } from './auth.js';
import { initTheme } from './theme.js';
import { renderNav } from './nav.js';

initTheme();
if (!requireAuth()) throw new Error('unauthed');
renderNav();

const claimId = new URLSearchParams(location.search).get('claim');
if (!claimId) window.location.href = '/dashboard.html';

async function load() {
  const claims = await api.get('/api/claims?role=requester');
  const claim = claims.find(c => String(c.id) === claimId);

  if (!claim) {
    document.getElementById('claim-detail').innerHTML = `<div class="alert alert--error">Claim not found.</div>`;
    return;
  }

  document.getElementById('claim-detail').innerHTML = `
    <div class="card" style="margin-bottom:var(--space-6)">
      <div class="card__header">
        <div>
          <div class="card__title">${esc(claim.gameName)}</div>
          <div style="font-size:var(--text-xs);color:var(--ir-text-muted);margin-top:var(--space-1)">
            Promoted by ${esc(claim.promoterName)} · ${esc(claim.promoType?.replace(/_/g,' '))}
          </div>
        </div>
        <span class="credit-chip credit-chip--value">${claim.creditsOffered} cr</span>
      </div>
      <div style="margin:var(--space-4) 0">
        <div style="font-size:var(--text-sm);font-weight:700;margin-bottom:var(--space-2)">Proof link</div>
        <a href="${esc(claim.proofUrl)}" target="_blank" rel="noopener" class="btn btn--secondary btn--sm">
          Open proof ↗
        </a>
        ${claim.platform ? `<span style="font-size:var(--text-xs);color:var(--ir-text-muted);margin-left:var(--space-3)">${esc(claim.platform)}</span>` : ''}
      </div>
      <div class="alert alert--warning" style="margin-bottom:var(--space-4)">
        <strong>Disclosure check:</strong> Confirm the content begins with "Ad: Indie Relay" (or equivalent disclosure) as required by ASA/FTC guidelines.
      </div>
      <div id="action-buttons" style="display:flex;gap:var(--space-3);flex-wrap:wrap">
        ${claim.status === 'pending' ? `
          <button class="btn btn--primary" id="approve-btn">Approve &amp; release credits</button>
          <button class="btn btn--secondary" id="committee-btn">Send to committee</button>
          <button class="btn btn--danger" id="dispute-btn">Dispute</button>
        ` : `<span class="status status--${claim.status}">${claim.status}</span>`}
      </div>
      <div id="dispute-form" style="display:none;margin-top:var(--space-4)">
        <div class="form-group">
          <label class="form-label" for="dispute-notes">Reason for dispute</label>
          <textarea class="form-textarea" id="dispute-notes" placeholder="Describe why the promo doesn't meet the requirements…"></textarea>
        </div>
        <button class="btn btn--danger" id="confirm-dispute">Confirm dispute</button>
      </div>
      <div id="form-error" class="form-error" style="margin-top:var(--space-3)"></div>
    </div>
  `;

  document.getElementById('approve-btn')?.addEventListener('click', async () => {
    await act(() => api.post(`/api/claims/${claimId}/approve`, {}), 'dashboard.html?approved=1');
  });

  document.getElementById('committee-btn')?.addEventListener('click', async () => {
    await act(() => api.post(`/api/claims/${claimId}/committee`, {}), 'dashboard.html');
  });

  document.getElementById('dispute-btn')?.addEventListener('click', () => {
    document.getElementById('dispute-form').style.display = 'block';
  });

  document.getElementById('confirm-dispute')?.addEventListener('click', async () => {
    const notes = document.getElementById('dispute-notes').value;
    await act(() => api.post(`/api/claims/${claimId}/dispute`, { notes }), 'dashboard.html');
  });
}

async function act(fn, redirect) {
  const err = document.getElementById('form-error');
  err.textContent = '';
  try {
    await fn();
    window.location.href = `/${redirect}`;
  } catch (ex) {
    err.textContent = ex.message;
  }
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

load().catch(console.error);
