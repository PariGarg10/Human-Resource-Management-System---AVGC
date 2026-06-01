window.HRMS = window.HRMS || {};

HRMS.initSidebar = function initSidebar(options = {}) {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.getElementById('sidebarCollapseBtn');
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const overlay = document.querySelector('.sidebar-overlay');
  const isDesktop = () => window.matchMedia('(min-width: 1025px)').matches;

  if (sidebar) {
    document.body.classList.add('has-floating-sidebar');
    document.body.classList.add('force-desktop-ui');
  }

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

  function expandSectionFor(el) {
    const section = el && el.closest ? el.closest('.sidebar-nav-section') : null;
    if (section) {
      section.classList.add('is-expanded');
      const id = section.getAttribute('data-section');
      if (id) localStorage.setItem(`hrms-sidebar-section-${id}`, 'open');
    }
  }

  document.querySelectorAll('.sidebar-nav-section').forEach((section) => {
    const id = section.getAttribute('data-section') || 'misc';
    const key = `hrms-sidebar-section-${id}`;
    const head = section.querySelector('.sidebar-accordion-head');
    const activeBtn = section.querySelector('[data-nav].is-active');
    const saved = localStorage.getItem(key);
    const shouldOpen = activeBtn != null || saved === 'open';
    if (shouldOpen) section.classList.add('is-expanded');
    else section.classList.remove('is-expanded');

    if (head) {
      head.addEventListener('click', (e) => {
        e.preventDefault();
        const next = !section.classList.contains('is-expanded');
        if (isDesktop()) {
          document.querySelectorAll('.sidebar-nav-section').forEach((s) => {
            if (s !== section) {
              s.classList.remove('is-expanded');
              s.classList.remove('is-hover-open');
              const otherId = s.getAttribute('data-section') || 'misc';
              localStorage.setItem(`hrms-sidebar-section-${otherId}`, 'closed');
            }
          });
          section.classList.remove('is-hover-open');
        }
        section.classList.toggle('is-expanded', next);
        localStorage.setItem(key, next ? 'open' : 'closed');
        if (isDesktop() && !next) {
          // Prevent :focus-within from keeping popup open after manual collapse.
          head.blur();
        }
      });
    }

    section.addEventListener('mouseenter', () => {
      if (!isDesktop()) return;
      document.querySelectorAll('.sidebar-nav-section').forEach((s) => s.classList.remove('is-hover-open'));
      section.classList.add('is-hover-open');
    });

    section.addEventListener('mouseleave', (e) => {
      if (!isDesktop()) return;
      const to = e.relatedTarget;
      if (to && section.contains(to)) return;
      section.classList.remove('is-hover-open');
    });

    const body = section.querySelector('.sidebar-accordion-body');
    if (body) {
      const optionCount = body.querySelectorAll('button, a').length;
      body.classList.toggle('is-dense-grid', optionCount > 6);

      body.addEventListener('wheel', (e) => {
        if (!isDesktop()) return;
        const canScroll = body.scrollHeight > body.clientHeight;
        if (!canScroll) return;
        e.preventDefault();
        e.stopPropagation();
        body.scrollTop += e.deltaY;
      }, { passive: false });
    }
  });

  document.querySelectorAll('.sidebar-nav [data-nav]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const section = btn.getAttribute('data-nav');
      if (typeof options.canNavigate === 'function' && !options.canNavigate(section)) {
        if (typeof options.onBlocked === 'function') options.onBlocked(section);
        closeMobile();
        return;
      }
      document.querySelectorAll('.sidebar-nav [data-nav]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      document.querySelectorAll('.view-section').forEach((v) => v.classList.remove('is-active'));
      const target = document.getElementById(`view-${section}`);
      if (target) {
        target.classList.add('is-active');
        const bc = document.getElementById('breadcrumbCurrent');
        if (bc) bc.textContent = btn.textContent.trim();
      }
      expandSectionFor(btn);
      const parentSection = btn.closest('.sidebar-nav-section');
      if (parentSection && isDesktop()) {
        document.querySelectorAll('.sidebar-nav-section').forEach((s) => s.classList.remove('is-hover-open'));
        parentSection.classList.remove('is-expanded');
      }
      closeMobile();
      if (options.onNavigate) options.onNavigate(section);
    });
  });

  const initial = document.querySelector('.sidebar-nav [data-nav].is-active');
  if (initial) expandSectionFor(initial);
};
