window.HRMS = window.HRMS || {};

HRMS.initNavbarClock = function initNavbarClock(elementId) {
  const el = document.getElementById(elementId || 'navbarClock');
  if (!el) return;
  function tick() {
    el.textContent = new Date().toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  tick();
  setInterval(tick, 30000);
};

HRMS.initProfileDropdown = function initProfileDropdown() {
  const wrap = document.querySelector('.profile-dropdown-wrap');
  const chip = wrap?.querySelector('.profile-chip');
  if (!chip || !wrap) return;

  // ✅ Load avatar from localStorage on every page init
  HRMS.syncAvatarFromStorage();

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    wrap.classList.toggle('is-open');
  });
  document.addEventListener('click', () => wrap.classList.remove('is-open'));
};

// ✅ Syncs all avatar <img> elements on the page from localStorage
HRMS.syncAvatarFromStorage = function () {
  const employee = JSON.parse(localStorage.getItem('employee') || '{}');
  const url = employee.avatar_url || employee.profile_image || null;
  if (!url) return;

  document.querySelectorAll(
    '.profile-chip img, .navbar-avatar, .user-avatar, [data-avatar], #profileAvatar, #navAvatar'
  ).forEach((img) => {
    img.src = url + '?t=' + Date.now();
  });
};

// ✅ Call this after a successful upload anywhere in the app
HRMS.updateAvatarEverywhere = function (newUrl) {
  // 1. Update localStorage
  const employee = JSON.parse(localStorage.getItem('employee') || '{}');
  employee.avatar_url = newUrl;
  localStorage.setItem('employee', JSON.stringify(employee));

  // 2. Update every avatar img on the current page immediately
  document.querySelectorAll(
    '.profile-chip img, .navbar-avatar, .user-avatar, [data-avatar], #profileAvatar, #navAvatar'
  ).forEach((img) => {
    img.src = newUrl + '?t=' + Date.now();
  });
};
HRMS.initNavbarSearch = function initNavbarSearch(tableBodyIds) {
  const input = document.getElementById('globalSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    (tableBodyIds || []).forEach((id) => {
      const tbody = document.getElementById(id);
      if (!tbody) return;
      tbody.querySelectorAll('tr').forEach((row) => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  });
};
