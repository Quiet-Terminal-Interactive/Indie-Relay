import { api } from './api.js';
import { requireCommittee } from './auth.js';
import { initTheme } from './theme.js';
import { renderNav } from './nav.js';

initTheme();
if (!requireCommittee()) throw new Error('not committee');
renderNav();

async function load() {
  const [queue, pending, members] = await Promise.all([
    api.get('/api/committee/queue'),
    api.get('/api/committee/pending-members'),
    api.get('/api/committee/members'),
  ]);

  const disputes = queue.filter(i => i.priority === 'dispute');
  const routine = queue.filter(i => i.priority !== 'dispute');

  renderColumn('disputes-column', disputes, true);
  renderColumn('routine-column', routine, false);
  renderPendingMembers(pending);
  renderMembers(members);
  bindMemberFilters(members);
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

function renderMembers(members) {
  const el = document.getElementById('members-list');
  if (!el) return;

  if (members.length === 0) {
    el.innerHTML = `<div class="empty-state"><p>No members found.</p></div>`;
    return;
  }

  el.innerHTML = members.map(m => {
    const statusBadge = m.isCommittee
      ? `<span class="badge badge--accent">Committee</span>`
      : m.status === 'banned'
        ? `<span class="badge badge--spend">Banned</span>`
        : m.status === 'suspended'
          ? `<span class="badge badge--primary">Suspended</span>`
          : `<span class="badge badge--earn">Active</span>`;

    const actions = m.isCommittee ? '' : `
      <div class="queue-item__actions" id="mactions-${m.id}">
        ${m.status === 'active' ? `
          <button class="btn btn--secondary btn--sm" data-maction="suspend" data-mid="${m.id}">Suspend</button>
          <button class="btn btn--danger btn--sm" data-maction="ban" data-mid="${m.id}">Ban</button>
        ` : m.status === 'suspended' ? `
          <button class="btn btn--secondary btn--sm" data-maction="unsuspend" data-mid="${m.id}">Lift suspension</button>
        ` : m.status === 'banned' ? `
          <button class="btn btn--secondary btn--sm" data-maction="unban" data-mid="${m.id}">Unban</button>
        ` : ''}
      </div>
      <div id="mconfirm-${m.id}" style="display:none;margin-top:var(--space-3)">
        <div class="form-group" style="margin-bottom:var(--space-2)">
          <input class="form-input" type="text" id="mreason-${m.id}" placeholder="Reason (optional)" maxlength="300">
        </div>
        <div style="display:flex;gap:var(--space-2)">
          <button class="btn btn--danger btn--sm" id="mconfirm-btn-${m.id}">Confirm</button>
          <button class="btn btn--ghost btn--sm" id="mcancel-btn-${m.id}">Cancel</button>
        </div>
        <div class="form-error" id="merr-${m.id}" style="margin-top:var(--space-2)"></div>
      </div>
    `;

    return `
      <div class="queue-item queue-item--routine" data-member-id="${m.id}" data-status="${m.status}">
        <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-2)">
          <span class="queue-item__game" style="margin-bottom:0">${esc(m.name)}</span>
          ${statusBadge}
          ${m.verified ? '' : `<span class="badge badge--neutral">Unverified</span>`}
        </div>
        <div class="queue-item__meta">${esc(m.memberType)} · ${esc(m.email)} · joined ${daysAgo(m.createdAt)}</div>
        ${actions}
      </div>
    `;
  }).join('');

  let pendingAction = null;

  el.querySelectorAll('[data-maction]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.maction;
      const id = btn.dataset.mid;

      // Unsuspend / unban don't need a reason — just a confirm step
      pendingAction = { action, id };
      document.getElementById(`mconfirm-${id}`).style.display = 'block';
      document.getElementById(`mreason-${id}`).placeholder =
        action === 'suspend' ? 'Reason for suspension (optional)' :
        action === 'ban'     ? 'Reason for ban (optional)' :
        'Reason (optional)';
      document.getElementById(`mreason-${id}`).focus();
    });
  });

  el.querySelectorAll('[id^="mcancel-btn-"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.id.replace('mcancel-btn-', '');
      document.getElementById(`mconfirm-${id}`).style.display = 'none';
      document.getElementById(`merr-${id}`).textContent = '';
      pendingAction = null;
    });
  });

  el.querySelectorAll('[id^="mconfirm-btn-"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.id.replace('mconfirm-btn-', '');
      const action = pendingAction?.action;
      const reason = document.getElementById(`mreason-${id}`)?.value.trim() || undefined;
      const errEl = document.getElementById(`merr-${id}`);
      errEl.textContent = '';
      btn.disabled = true;

      try {
        await api.post(`/api/committee/members/${id}/${action}`, { reason });
        // Refresh just the member row's status
        const row = el.querySelector(`[data-member-id="${id}"]`);
        const newStatus = action === 'ban' ? 'banned' : action === 'suspend' ? 'suspended' : 'active';
        row.dataset.status = newStatus;
        // Reload list so badges and buttons reflect new status
        const updated = await api.get('/api/committee/members');
        bindMemberFilters(updated);
        applyMemberFilters();
      } catch (ex) {
        errEl.textContent = ex.message ?? 'Something went wrong.';
        btn.disabled = false;
      }
    });
  });
}

let _allMembers = [];

function applyMemberFilters() {
  const search = document.getElementById('member-search')?.value.toLowerCase() ?? '';
  const status = document.getElementById('member-status-filter')?.value ?? '';
  const filtered = _allMembers.filter(m => {
    const matchSearch = !search || m.name.toLowerCase().includes(search) || m.email.toLowerCase().includes(search);
    const matchStatus = !status || m.status === status;
    return matchSearch && matchStatus;
  });
  renderMembers(filtered);
}

function bindMemberFilters(allMembers) {
  _allMembers = allMembers;
  // Listeners are attached once; subsequent calls just update the data store
  if (!document.getElementById('member-search')?._filterBound) {
    document.getElementById('member-search').addEventListener('input', applyMemberFilters);
    document.getElementById('member-status-filter').addEventListener('change', applyMemberFilters);
    document.getElementById('member-search')._filterBound = true;
  }
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

load().catch(console.error);
