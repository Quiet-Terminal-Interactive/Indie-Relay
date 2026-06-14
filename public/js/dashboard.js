import { api } from './api.js';
import { requireAuth, getMember } from './auth.js';
import { initTheme } from './theme.js';
import { renderNav } from './nav.js';

initTheme();
if (!requireAuth()) throw new Error('unauthed');
renderNav();

const member = getMember();

async function load() {
  const me = await api.get('/api/members/me');

  if (!me.verified) {
    document.getElementById('pending-screen').style.display = 'flex';
    document.getElementById('dashboard-content').style.display = 'none';
    return;
  }

  const [balanceData, ledger, myRequests, pendingClaims, myClaims] = await Promise.all([
    api.get('/api/credits/balance'),
    api.get('/api/credits/ledger'),
    api.get('/api/requests?mine=true').catch(() => []),
    api.get('/api/claims?role=requester'),
    api.get('/api/claims?role=promoter'),
  ]);

  document.getElementById('balance-number').textContent = balanceData.balance;
  document.getElementById('balance-cap').textContent = `/ 20 credits`;

  const ledgerEl = document.getElementById('recent-ledger');
  if (ledger.length === 0) {
    ledgerEl.innerHTML = `<div class="empty-state"><p>No transactions yet.</p></div>`;
  } else {
    ledgerEl.innerHTML = ledger.slice(0, 5).map(tx => `
      <div class="ledger-item">
        <div>
          <div class="ledger-item__reason">${esc(tx.reason)}</div>
          <div class="ledger-item__date">${formatDate(tx.createdAt)}</div>
        </div>
        <div class="ledger-item__amount ${tx.amount >= 0 ? 'ledger-item__amount--pos' : 'ledger-item__amount--neg'}">
          ${tx.amount >= 0 ? '+' : ''}${tx.amount}
        </div>
      </div>
    `).join('');
  }

  const signOffEl = document.getElementById('pending-signoffs');
  const pending = pendingClaims.filter(c => c.status === 'pending');
  if (pending.length === 0) {
    signOffEl.innerHTML = `<div class="empty-state"><p>No pending sign-offs.</p></div>`;
  } else {
    signOffEl.innerHTML = pending.map(c => `
      <div class="card card--flat" style="margin-bottom:var(--space-4)">
        <div class="card__header">
          <div>
            <div class="card__title">${esc(c.gameName)}</div>
            <div class="ledger-item__date">by ${esc(c.promoterName)} · ${esc(c.promoType?.replace(/_/g,' '))}</div>
          </div>
          <span class="credit-chip credit-chip--value">${c.creditsOffered} cr</span>
        </div>
        <div style="display:flex;gap:var(--space-2);margin-top:var(--space-3)">
          <a href="/sign-off.html?claim=${c.id}" class="btn btn--primary btn--sm">Review</a>
        </div>
      </div>
    `).join('');
  }

  const myClaimsEl = document.getElementById('my-claims');
  if (myClaims.length === 0) {
    myClaimsEl.innerHTML = `<div class="empty-state"><p>You haven't submitted any promos yet. <a href="/marketplace.html">Browse requests</a></p></div>`;
  } else {
    myClaimsEl.innerHTML = myClaims.slice(0, 5).map(c => `
      <div class="ledger-item">
        <div>
          <div class="ledger-item__reason">${esc(c.proofUrl ?? 'Proof submitted')}</div>
          <div class="ledger-item__date">${formatDate(c.claimedAt)}</div>
        </div>
        <span class="status status--${c.status}">${c.status}</span>
      </div>
    `).join('');
  }

  const twoMonthsAgo = Date.now() - 56 * 24 * 60 * 60 * 1000;
  const expiring = pending.filter(c => new Date(c.claimedAt).getTime() < twoMonthsAgo);
  if (expiring.length > 0) {
    const alertEl = document.getElementById('expiry-alert');
    alertEl.style.display = 'block';
    alertEl.textContent = `${expiring.length} claim(s) are approaching the 2-month review window. Review them soon.`;
  }
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

load().catch(console.error);
