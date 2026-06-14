import { api } from './api.js';
import { requireCommittee } from './auth.js';
import { initTheme } from './theme.js';
import { renderNav } from './nav.js';

initTheme();
if (!requireCommittee()) throw new Error('not committee');
renderNav();

async function load() {
  const [queue, pending] = await Promise.all([
    api.get('/api/committee/queue'),
    api.get('/api/committee/pending-members'),
  ]);

  const disputes = queue.filter(i => i.priority === 'dispute');
  const routine = queue.filter(i => i.priority !== 'dispute');

  renderColumn('disputes-column', disputes, true);
  renderColumn('routine-column', routine, false);
  renderPendingMembers(pending);
}

function renderPendingMembers(members) {
  const el = document.getElementById('pending-members-list');
  if (!el) return;

  if (members.length === 0) {
    el.innerHTML = `<div class="empty-state"><p>No pending applications.</p></div>`;
    return;
  }

  el.innerHTML = members.map(m => `
    <div class="queue-item queue-item--routine" data-id="${m.id}">
      <div class="queue-item__game">${esc(m.name)}</div>
      <div class="queue-item__meta">
        ${esc(m.memberType)} · ${esc(m.email)} · applied ${daysAgo(m.createdAt)}
      </div>
      ${m.verificationUrl ? `
        <div class="queue-item__proof">
          <a href="${esc(m.verificationUrl)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">View verification link ↗</a>
        </div>
      ` : `<div class="queue-item__meta" style="font-style:italic">No verification link provided</div>`}
      <div class="queue-item__actions">
        <button class="btn btn--primary btn--sm" data-member-action="approve" data-id="${m.id}">Approve</button>
        <button class="btn btn--danger btn--sm" data-member-action="reject" data-id="${m.id}">Reject</button>
      </div>
      <div class="form-error" id="merr-${m.id}" style="margin-top:var(--space-2)"></div>
    </div>
  `).join('');

  el.querySelectorAll('[data-member-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.memberAction;
      const id = btn.dataset.id;
      const errEl = document.getElementById(`merr-${id}`);
      errEl.textContent = '';
      try {
        await api.post(`/api/committee/pending-members/${id}/${action}`, {});
        btn.closest('.queue-item').style.opacity = '0.4';
        btn.closest('.queue-item').querySelectorAll('button').forEach(b => b.disabled = true);
      } catch (ex) {
        errEl.textContent = ex.message;
      }
    });
  });
}

function daysAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function renderColumn(id, items, isDispute) {
  const el = document.getElementById(id);
  if (!el) return;

  if (items.length === 0) {
    el.innerHTML = `<div class="empty-state"><p>No items here.</p></div>`;
    return;
  }

  el.innerHTML = items.map(item => `
    <div class="queue-item queue-item--${isDispute ? 'dispute' : 'routine'}" data-id="${item.id}">
      <div class="queue-item__game">${esc(item.gameName)}</div>
      <div class="queue-item__meta">
        ${esc(item.promoType?.replace(/_/g,' '))} · promoted by ${esc(item.promoterName)} · ${esc(item.creditsOffered)} cr
        ${item.notes ? ` · <em>${esc(item.notes)}</em>` : ''}
      </div>
      <div class="queue-item__proof">
        <a href="${esc(item.proofUrl)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">View proof ↗</a>
      </div>
      <div class="queue-item__actions">
        <button class="btn btn--primary btn--sm" data-action="approve" data-id="${item.id}">Approve</button>
        <button class="btn btn--secondary btn--sm" data-action="partial" data-id="${item.id}">50% payout</button>
        <button class="btn btn--danger btn--sm" data-action="reject" data-id="${item.id}">Reject</button>
      </div>
      <div class="form-error" id="err-${item.id}" style="margin-top:var(--space-2)"></div>
    </div>
  `).join('');

  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const itemId = btn.dataset.id;
      const errEl = document.getElementById(`err-${itemId}`);
      errEl.textContent = '';

      try {
        await api.post(`/api/committee/queue/${itemId}/${action}`, {});
        btn.closest('.queue-item').style.opacity = '0.4';
        btn.closest('.queue-item').querySelectorAll('button').forEach(b => b.disabled = true);
      } catch (ex) {
        errEl.textContent = ex.message;
      }
    });
  });
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

load().catch(console.error);
