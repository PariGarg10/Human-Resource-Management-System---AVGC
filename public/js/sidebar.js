window.HRMS = window.HRMS || {};

HRMS.initSidebar = function initSidebar(options = {}) {
  function setActiveViewSection(sectionId) {
    document.querySelectorAll('.view-section').forEach((view) => {
      const shouldActivate = view.id === `view-${sectionId}`;
      view.classList.toggle('is-active', shouldActivate);
      view.toggleAttribute('hidden', !shouldActivate);
    });
  }

  if (options.onNavigate) {
    HRMS._sidebarOnNavigate = options.onNavigate;
  }
  if (document.body.dataset.hrmsSidebarInit === '1') {
    if (window.HRMS?.refreshNavIcons) {
      HRMS.refreshNavIcons(document.querySelector('.sidebar') || document);
    }
    return;
  }
  document.body.dataset.hrmsSidebarInit = '1';

  const sidebar = document.querySelector('.sidebar');
  const toggle = document.getElementById('sidebarCollapseBtn');
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const overlay = document.querySelector('.sidebar-overlay');
  const isDesktop = () => window.matchMedia('(min-width: 1025px)').matches;

  function syncShellLayout() {
    if (!sidebar) return;
    const desktop = isDesktop();
    document.body.classList.toggle('has-floating-sidebar', desktop);
    document.body.classList.toggle('force-desktop-ui', desktop);
    document.body.classList.remove('shell-mobile');
    document.body.classList.remove('shell-tablet');
    document.body.classList.remove('shell-desktop');
    document.body.classList.remove('has-expanded-sidebar');
    document.body.classList.remove('has-bottom-nav');
    if (!desktop) {
      document.body.classList.remove('sidebar-collapsed');
    } else {
      document.querySelectorAll('.sidebar-nav-section').forEach((s) => {
        s.classList.remove('is-expanded');
        if (!s.classList.contains('is-pinned')) s.classList.remove('is-hover-open');
      });
    }
  }

  syncShellLayout();
  window.addEventListener('resize', syncShellLayout);

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
    if (!section) return;
    const id = section.getAttribute('data-section');
    if (isDesktop()) {
      document.querySelectorAll('.sidebar-nav-section').forEach((s) => s.classList.remove('is-expanded'));
      return;
    }
    section.classList.add('is-expanded');
    if (id) localStorage.setItem(`hrms-sidebar-section-${id}`, 'open');
  }

  let hoverCloseTimer = null;

  function clearHoverCloseTimer() {
    if (hoverCloseTimer) {
      clearTimeout(hoverCloseTimer);
      hoverCloseTimer = null;
    }
  }

  function scheduleHoverClose(section) {
    if (section.classList.contains('is-pinned')) return;
    clearHoverCloseTimer();
    hoverCloseTimer = setTimeout(() => {
      section.classList.remove('is-hover-open');
      hoverCloseTimer = null;
    }, 200);
  }

  function clearPinnedSections(except) {
    document.querySelectorAll('.sidebar-nav-section').forEach((s) => {
      if (except && s === except) return;
      s.classList.remove('is-pinned');
    });
  }

  function navigateSidebarGo(target) {
    const href = target?.getAttribute?.('data-nav-go');
    if (!href) return;
    clearHoverCloseTimer();
    closeMobile();
    window.location.assign(href);
  }

  function bindNavGoButtons(root) {
    (root || document).querySelectorAll('[data-nav-go]').forEach((el) => {
      if (el.dataset.navGoBound === '1') return;
      el.dataset.navGoBound = '1';
      const go = (e) => {
        if (e.type === 'mousedown' && e.button !== 0) return;
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        navigateSidebarGo(el);
      };
      el.addEventListener('mousedown', go);
      el.addEventListener('click', go);
      el.addEventListener('keydown', go);
    });
  }

  document.querySelectorAll('.sidebar-nav-section').forEach((section) => {
    const id = section.getAttribute('data-section') || 'misc';
    const key = `hrms-sidebar-section-${id}`;
    const head = section.querySelector('.sidebar-accordion-head');
    const activeBtn = section.querySelector('[data-nav].is-active');
    const saved = localStorage.getItem(key);
    const shouldOpen = activeBtn != null || saved === 'open';
    if (shouldOpen && !isDesktop()) section.classList.add('is-expanded');
    else section.classList.remove('is-expanded');

    if (head) {
      head.addEventListener('click', (e) => {
        if (head.hasAttribute('data-nav')) return;
        e.preventDefault();
        e.stopPropagation();
        if (isDesktop()) {
          head.blur();
          return;
        }
        const next = !section.classList.contains('is-expanded');
        section.classList.toggle('is-expanded', next);
        section.classList.toggle('is-pinned', next);
        if (!next) section.classList.remove('is-pinned');
        else clearPinnedSections(section);
        localStorage.setItem(key, next ? 'open' : 'closed');
      });
    }

    section.addEventListener('mouseenter', () => {
      if (!isDesktop()) return;
      clearHoverCloseTimer();
      document.querySelectorAll('.sidebar-nav-section').forEach((s) => {
        if (s !== section) s.classList.remove('is-hover-open');
      });
      section.classList.add('is-hover-open');
    });

    section.addEventListener('mouseleave', (e) => {
      if (!isDesktop()) return;
      const to = e.relatedTarget;
      if (to && section.contains(to)) return;
      scheduleHoverClose(section);
    });

    const body = section.querySelector('.sidebar-accordion-body');
    if (body) {
      const sectionId = section.getAttribute('data-section') || '';
      body.classList.toggle('sidebar-menu-two-col', sectionId === 'administration');

      body.addEventListener('mouseenter', () => {
        if (!isDesktop()) return;
        clearHoverCloseTimer();
        section.classList.add('is-hover-open');
      });

      body.addEventListener('mouseleave', (e) => {
        if (!isDesktop()) return;
        const to = e.relatedTarget;
        if (to && section.contains(to)) return;
        scheduleHoverClose(section);
      });

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

  function activateNavSection(btn) {
      if (btn.disabled || btn.classList.contains('nav-item-disabled')) return;
      const section = btn.getAttribute('data-nav');
      if (typeof options.canNavigate === 'function' && !options.canNavigate(section)) {
        if (typeof options.onBlocked === 'function') options.onBlocked(section);
        closeMobile();
        return;
      }
      document.querySelectorAll('.sidebar-nav [data-nav]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      setActiveViewSection(section);
      const target = document.getElementById(`view-${section}`);
      if (target) {
        const bc = document.getElementById('breadcrumbCurrent');
        if (bc) bc.textContent = btn.textContent.trim();
      }
      expandSectionFor(btn);
      const parentSection = btn.closest('.sidebar-nav-section');
      if (isDesktop()) {
        clearHoverCloseTimer();
        document.querySelectorAll('.sidebar-nav-section').forEach((s) => {
          s.classList.remove('is-hover-open');
          s.classList.remove('is-expanded');
        });
        btn.blur();
      }
      closeMobile();
      if (section === 'social-portal' || section === 'company-social') {
        const rect = btn.getBoundingClientRect();
        HRMS.fireConfettiBurst?.({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }
      const navCb = HRMS._sidebarOnNavigate || options.onNavigate;
      if (navCb) navCb(section);
  }

  document.querySelectorAll('.sidebar-nav [data-nav]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      activateNavSection(btn);
    });
  });

  document.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-nav-jump]');
    if (jump) {
      e.preventDefault();
      const section = jump.getAttribute('data-nav-jump');
      const navBtn = document.querySelector(`.sidebar-nav [data-nav="${section}"]`);
      if (navBtn) activateNavSection(navBtn);
      return;
    }
  });

  bindNavGoButtons(document);

  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('[data-nav-go]')) return;
    if (e.target.closest('.sidebar-nav-section')) return;
    document.querySelectorAll('.sidebar-nav-section').forEach((s) => {
      s.classList.remove('is-pinned');
      s.classList.remove('is-hover-open');
    });
  });

  const initial = document.querySelector('.sidebar-nav [data-nav].is-active');
  if (initial) {
    const initialSection = initial.getAttribute('data-nav');
    if (initialSection) setActiveViewSection(initialSection);
    expandSectionFor(initial);
  }

  if (window.HRMS?.refreshNavIcons) HRMS.refreshNavIcons(sidebar || document);
};

/** Bind [data-nav-go] buttons (e.g. in main content) after dynamic panels load. */
HRMS.bindNavGoButtons = function bindNavGoButtonsGlobal(root) {
  (root || document).querySelectorAll('[data-nav-go]').forEach((el) => {
    if (el.dataset.navGoBound === '1') return;
    el.dataset.navGoBound = '1';
    const go = (e) => {
      if (e.type === 'mousedown' && e.button !== 0) return;
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      const href = el.getAttribute('data-nav-go');
      if (href) window.location.assign(href);
    };
    el.addEventListener('mousedown', go);
    el.addEventListener('click', go);
    el.addEventListener('keydown', go);
  });
};
