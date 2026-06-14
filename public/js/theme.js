const KEY = 'ir_theme';

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  const btn = document.getElementById('theme-toggle');
  if (btn) btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');

  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  if (sun) sun.style.display = theme === 'dark' ? 'none' : '';
  if (moon) moon.style.display = theme === 'dark' ? '' : 'none';
}

export function initTheme() {
  const saved = localStorage.getItem(KEY);
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved ?? system);

  // Delegated so it works even though the button is injected by renderNav() after this runs
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#theme-toggle')) return;
    const current = document.documentElement.getAttribute('data-theme') ?? 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, next);
    applyTheme(next);
  });
}
