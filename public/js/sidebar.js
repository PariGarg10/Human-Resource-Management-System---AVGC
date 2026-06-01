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
    }, 280);
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
    if (shouldOpen) section.classList.add('is-expanded');
    else section.classList.remove('is-expanded');

    if (head) {
      head.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !section.classList.contains('is-expanded');
        if (isDesktop()) {
          document.querySelectorAll('.sidebar-nav-section').forEach((s) => {
            if (s !== section) {
              s.classList.remove('is-expanded');
              s.classList.remove('is-hover-open');
              s.classList.remove('is-pinned');
              const otherId = s.getAttribute('data-section') || 'misc';
              localStorage.setItem(`hrms-sidebar-section-${otherId}`, 'closed');
            }
          });
          clearHoverCloseTimer();
          section.classList.remove('is-hover-open');
        }
        section.classList.toggle('is-expanded', next);
        section.classList.toggle('is-pinned', next);
        if (!next) section.classList.remove('is-pinned');
        else clearPinnedSections(section);
        localStorage.setItem(key, next ? 'open' : 'closed');
        if (isDesktop() && !next) {
          head.blur();
        }
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
        clearHoverCloseTimer();
        document.querySelectorAll('.sidebar-nav-section').forEach((s) => s.classList.remove('is-hover-open'));
        parentSection.classList.remove('is-expanded');
      }
      closeMobile();
      if (options.onNavigate) options.onNavigate(section);
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
  if (initial) expandSectionFor(initial);
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
