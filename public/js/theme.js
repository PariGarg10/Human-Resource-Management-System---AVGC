(function initTheme() {
  function readStoredTheme() {
    try {
      const v = localStorage.getItem('theme_preference') || localStorage.getItem('hrms-theme');
      if (v === 'dark' || v === 'light') return v;
      return 'light';
    } catch (_e) {
      return 'light';
    }
  }

  function applyTheme(mode) {
    const m = mode === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', m);
    try {
      localStorage.setItem('theme_preference', m);
      localStorage.removeItem('hrms-theme');
    } catch (_e) {}
    syncFab();
  }

  function syncFab() {
    const btn = document.getElementById('hrmsThemeFab');
    if (!btn) return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = dark ? '☀️' : '🌙';
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  applyTheme(readStoredTheme());

  window.HRMS = window.HRMS || {};
  HRMS.toggleTheme = function toggleTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(dark ? 'light' : 'dark');
  };

  HRMS.initThemeFab = function initThemeFab() {
    let btn = document.getElementById('hrmsThemeFab');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'hrmsThemeFab';
      btn.className = 'hrms-theme-fab';
      btn.addEventListener('click', () => HRMS.toggleTheme());
      document.body.appendChild(btn);
    }
    syncFab();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => HRMS.initThemeFab());
  } else {
    HRMS.initThemeFab();
  }
})();
