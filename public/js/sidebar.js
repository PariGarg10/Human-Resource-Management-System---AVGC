window.HRMS = window.HRMS || {};

HRMS.initSidebar = function initSidebar(options = {}) {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.getElementById('sidebarCollapseBtn');
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const overlay = document.querySelector('.sidebar-overlay');

  if (toggle) {
    toggle.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem('hrms-sidebar-collapsed', document.body.classList.contains('sidebar-collapsed'));
    });
    if (localStorage.getItem('hrms-sidebar-collapsed') === 'true') {
      document.body.classList.add('sidebar-collapsed');
    }
  }

  function closeMobile() {
    document.body.classList.remove('mobile-sidebar-open');
  }

  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      document.body.classList.toggle('mobile-sidebar-open');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeMobile);
  }

  document.querySelectorAll('.sidebar-nav [data-nav]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const section = btn.getAttribute('data-nav');
      document.querySelectorAll('.sidebar-nav [data-nav]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      document.querySelectorAll('.view-section').forEach((v) => v.classList.remove('is-active'));
      const target = document.getElementById(`view-${section}`);
      if (target) {
        target.classList.add('is-active');
        const bc = document.getElementById('breadcrumbCurrent');
        if (bc) bc.textContent = btn.textContent.trim();
      }
      closeMobile();
      if (options.onNavigate) options.onNavigate(section);
    });
  });
};
