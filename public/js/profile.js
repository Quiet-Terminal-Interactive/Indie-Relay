import { api } from './api.js';
import { requireAuth, getMember } from './auth.js';
import { initTheme } from './theme.js';
import { renderNav } from './nav.js';

initTheme();
if (!requireAuth()) throw new Error('unauthed');
renderNav();

async function load() {
  const [me, ledger] = await Promise.all([
    api.get('/api/members/me'),
    api.get('/api/credits/ledger'),
  ]);

  document.getElementById('member-name').textContent = me.name;
  document.getElementById('member-type').textContent = me.memberType;
  document.getElementById('member-email').textContent = me.email;
  document.getElementById('member-since').textContent = new Date(me.createdAt).toLocaleDateString('en-GB', { month:'long', year:'numeric' });
  document.getElementById('member-balance').textContent = me.creditBalance;
  document.getElementById('member-months').textContent = me.activeMonths;

  const multiplier = me.activeMonths >= 12 ? '1.5×' : me.activeMonths >= 6 ? '1.25×' : '1.0×';
  document.getElementById('member-multiplier').textContent = multiplier;

  const verifiedEl = document.getElementById('member-verified');
  verifiedEl.innerHTML = me.verified
    ? `<span class="badge badge--earn">Verified</span>`
    : `<span class="badge badge--neutral">Pending verification</span>`;

  const ledgerEl = document.getElementById('full-ledger');
  if (ledger.length === 0) {
    ledgerEl.innerHTML = `<div class="empty-state"><p>No transactions yet.</p></div>`;
  } else {
    ledgerEl.innerHTML = ledger.map(tx => `
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

  document.getElementById('gen-invite').addEventListener('click', async () => {
    const code = await api.post('/api/members/me/invite', {});
    document.getElementById('invite-code').textContent = code.code;
    document.getElementById('invite-result').style.display = 'block';
  });
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

load().catch(console.error);
