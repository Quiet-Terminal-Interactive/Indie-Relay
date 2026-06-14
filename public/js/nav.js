import { getMember, clearSession, getToken } from './auth.js';
import { applyTheme } from './theme.js';
import { api } from './api.js';

export function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;

  const member = getMember();
  const authed = !!getToken();

  nav.innerHTML = `
    <div class="nav__inner">
      <a href="/index.html" class="nav__logo">
        <img src="/images/IndieRelayLogo.png" alt="Indie Relay" class="nav__logo-img">
      </a>
      <nav class="nav__links" aria-label="Main navigation">
        ${authed ? `
          <a href="/dashboard.html" class="nav__link">Dashboard</a>
          <a href="/marketplace.html" class="nav__link">Marketplace</a>
          <a href="/promo-types.html" class="nav__link">Promo types</a>
          ${member?.isCommittee ? `<a href="/committee.html" class="nav__link">Committee</a>` : ''}
        ` : `
          <a href="/promo-types.html" class="nav__link">Promo types</a>
          <a href="#how-it-works" class="nav__link">How it works</a>
        `}
      </nav>
      <div class="nav__right">
        ${authed ? `
          <div class="nav__balance" id="nav-balance">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/>
              <path d="M7 4v3l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span id="nav-balance-val">—</span> cr
          </div>
          <a href="/profile.html" class="btn btn--ghost btn--sm">${esc(member?.name ?? 'Profile')}</a>
          <button class="btn btn--secondary btn--sm" id="logout-btn">Log out</button>
        ` : `
          <a href="/login.html" class="btn btn--ghost btn--sm">Log in</a>
          <a href="/apply.html" class="btn btn--primary btn--sm">Apply</a>
        `}
        <button class="theme-toggle" id="theme-toggle" aria-label="Toggle theme">
          <svg id="theme-icon-sun" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="8" cy="8" r="3"/>
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
          </svg>
          <svg id="theme-icon-moon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="display:none">
            <path d="M13 10A6 6 0 016 3a6 6 0 000 10 6 6 0 007-3z"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  if (authed) {
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      clearSession();
      window.location.href = '/index.html';
    });

    api.get('/api/credits/balance').then(d => {
      const el = document.getElementById('nav-balance-val');
      if (el) el.textContent = d.balance;
    }).catch(() => {});
  }

  applyTheme(document.documentElement.getAttribute('data-theme') ?? 'light');
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
