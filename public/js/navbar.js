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

HRMS.normalizeProfilePhotoUrl = function normalizeProfilePhotoUrl(url) {
  if (!url) return '';
  const value = String(url).trim();
  if (!value || value.indexOf('blob:') === 0) return value;
  const match = value.match(/profile-photos\/([^/?#]+)/i);
  if (match && match[1]) {
    return `/uploads/profile-photos/${match[1]}`;
  }
  return value.startsWith('/') ? value : `/${value}`;
};

HRMS.profilePhotoSrc = function profilePhotoSrc(url) {
  const normalized = HRMS.normalizeProfilePhotoUrl(url);
  if (!normalized) return '';
  if (normalized.indexOf('blob:') === 0) return normalized;
  const sep = normalized.includes('?') ? '&' : '?';
  return `${normalized}${sep}t=${Date.now()}`;
};

HRMS.showProfilePhotoInitials = function showProfilePhotoInitials(name) {
  const letter = (name || '?').charAt(0).toUpperCase();
  document
    .querySelectorAll('#profilePhotoPreview, #mgrProfilePhotoPreview, #navAvatar')
    .forEach((img) => {
      img.removeAttribute('src');
      img.classList.add('hidden');
    });
  ['profilePhotoInitial', 'mgrProfilePhotoInitial'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = letter;
    el.classList.remove('hidden');
  });
  const side = document.getElementById('sidebarAvatar');
  if (side) {
    side.innerHTML = '';
    side.textContent = letter;
  }
};

HRMS.applyProfilePhotoToDom = function applyProfilePhotoToDom(url, displayName) {
  if (!url || String(url).indexOf('blob:') === 0) return;
  const normalized = HRMS.normalizeProfilePhotoUrl(url);
  const src = HRMS.profilePhotoSrc(normalized);
  let employee = {};
  try {
    employee = JSON.parse(localStorage.getItem('employee') || '{}');
  } catch (_e) {}
  const name = displayName || employee.name || '?';

  function bindImg(img) {
    img.onerror = () => {
      img.onerror = null;
      HRMS.showProfilePhotoInitials(name);
    };
    img.onload = () => {
      ['profilePhotoInitial', 'mgrProfilePhotoInitial'].forEach((id) => {
        document.getElementById(id)?.classList.add('hidden');
      });
    };
    img.src = src;
    img.classList.remove('hidden');
  }

  document
    .querySelectorAll(
      '.profile-chip img, .navbar-avatar, .user-avatar, [data-avatar], #profileAvatar, #navAvatar, #profilePhotoPreview, #mgrProfilePhotoPreview'
    )
    .forEach(bindImg);

  const side = document.getElementById('sidebarAvatar');
  if (side) {
    const img = document.createElement('img');
    img.className = 'sidebar-avatar-img';
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;';
    bindImg(img);
    side.innerHTML = '';
    side.appendChild(img);
  }
};

// ✅ Syncs all avatar <img> elements on the page from localStorage
HRMS.syncAvatarFromStorage = function () {
  const employee = JSON.parse(localStorage.getItem('employee') || '{}');
  const url = employee.profilePhotoUrl || employee.avatar_url || employee.profile_image || null;
  if (!url || String(url).indexOf('blob:') === 0) return;
  HRMS.applyProfilePhotoToDom(url);
};

// ✅ Call this after a successful upload anywhere in the app (server URL only — not blob previews)
HRMS.updateAvatarEverywhere = function (newUrl, displayName) {
  const isBlob = String(newUrl).indexOf('blob:') === 0;
  if (!isBlob && newUrl) {
    const normalized = HRMS.normalizeProfilePhotoUrl(newUrl);
    const employee = JSON.parse(localStorage.getItem('employee') || '{}');
    employee.avatar_url = normalized;
    employee.profilePhotoUrl = normalized;
    localStorage.setItem('employee', JSON.stringify(employee));
    HRMS.applyProfilePhotoToDom(normalized, displayName || employee.name);
    return;
  }
  if (isBlob) {
    const img = document.getElementById('profilePhotoPreview') || document.getElementById('mgrProfilePhotoPreview');
    if (img) {
      img.src = newUrl;
      img.classList.remove('hidden');
      ['profilePhotoInitial', 'mgrProfilePhotoInitial'].forEach((id) => {
        document.getElementById(id)?.classList.add('hidden');
      });
    }
  }
};

HRMS.syncNavProfileName = function (name, email) {
  const nm = name || '';
  const em = email || '';
  const side = document.getElementById('sidebarUserName');
  if (side) side.textContent = nm || side.textContent;
  const nav = document.getElementById('navProfileEmail');
  if (nav) nav.textContent = nm || em || '—';
  const mh = document.getElementById('mgrProfileHeading');
  if (mh && nm) mh.textContent = nm;
  const ah = document.getElementById('adminProfileHeading');
  if (ah && nm) ah.textContent = nm;
};

HRMS.initNotificationBell = function initNotificationBell(apiFn) {
  const bell = document.getElementById('notificationBell');
  const panel = document.getElementById('notificationPanel');
  const badge = document.getElementById('notificationBadge');
  const list = document.getElementById('notificationList');
  if (!bell || !panel || !list) return;

  async function refresh() {
    try {
      let currentUser = {};
      try {
        currentUser = JSON.parse(localStorage.getItem('employee') || '{}');
      } catch (_e) {}
      const path = currentUser.id ? `/api/notifications/${currentUser.id}` : '/api/notifications';
      const data = await apiFn(path);
      const items = data.notifications || [];
      const unread = items.filter((n) => !n.isRead).length;
      if (badge) {
        badge.textContent = unread > 9 ? '9+' : String(unread);
        badge.classList.toggle('hidden', unread === 0);
      }
      if (!items.length) {
        list.innerHTML = '<p class="stat-sub" style="padding:12px;">No notifications</p>';
        return;
      }
      list.innerHTML = items
        .map(
          (n) =>
            `<button type="button" class="notif-row" data-notif-id="${n.id}" data-read="${n.isRead ? '1' : '0'}">
              <span class="notif-icon">${n.type === 'birthday' ? '🎂' : n.type === 'broadcast' ? '🔔' : '•'}</span>
              <span class="notif-msg">${String(n.message || '').replace(/</g, '&lt;')}</span>
            </button>`
        )
        .join('');
      list.querySelectorAll('.notif-row').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.getAttribute('data-notif-id'));
          const read = btn.getAttribute('data-read') === '1';
          if (!read) {
            try {
              await apiFn(`/api/notifications/${id}/read`, { method: 'PATCH' });
              btn.setAttribute('data-read', '1');
            } catch (_e) {}
            await refresh();
          }
        });
      });
    } catch (_e) {
      if (badge) badge.classList.add('hidden');
    }
  }

  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = panel.classList.toggle('is-open');
    if (open) refresh();
  });
  panel.addEventListener('mousedown', (e) => e.stopPropagation());
  document.addEventListener('click', () => panel.classList.remove('is-open'));

  refresh();
  setInterval(refresh, 60000);
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
