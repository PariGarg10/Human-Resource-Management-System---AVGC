(function initTheme() {
  const saved = localStorage.getItem('hrms-theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  window.HRMS = window.HRMS || {};
  HRMS.toggleTheme = function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    if (next === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('hrms-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('hrms-theme', 'light');
    }
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.setAttribute('aria-label', next === 'dark' ? 'Light mode' : 'Dark mode');
  };
})();
