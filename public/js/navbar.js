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
    if (wrap.classList.contains('is-open') && window.HRMS?.refreshNavIcons) {
      HRMS.refreshNavIcons(wrap);
    }
  });
  document.addEventListener('click', () => wrap.classList.remove('is-open'));
};

HRMS.normalizeProfilePhotoUrl = function normalizeProfilePhotoUrl(url) {
  if (!url) return '';
  const value = String(url).trim();
  if (!value || value.indexOf('blob:') === 0) return value;
  if (value.startsWith('/api/users/profile-photo/')) return value;
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

HRMS.syncPortalUserIdentity = function syncPortalUserIdentity(user, punchIn, punchOut) {
  const escapeHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const name = (user && (user.name || user.email)) || '—';
  const designation = (user && user.designation) || '—';
  const empId = (user && user.employeecode) || '—';
  const root = document.getElementById('sidebarUserIdentity');
  if (root) {
    root.innerHTML = `
      <p class="portal-user-identity-name">${escapeHtml(name)}</p>
      <p class="portal-user-identity-line">${escapeHtml(designation)}</p>
      <p class="portal-user-identity-line">${escapeHtml(empId)}</p>
      <p class="portal-user-identity-line">${escapeHtml(punchIn || '—')}</p>
      <p class="portal-user-identity-line">${escapeHtml(punchOut || '—')}</p>
    `;
  }
  HRMS.syncNavProfileName(name, user && user.email);
};

HRMS.loadPortalUserIdentity = async function loadPortalUserIdentity(apiFn) {
  let user = {};
  try {
    user = JSON.parse(localStorage.getItem('employee') || '{}');
  } catch (_e) {}
  let punchIn = '—';
  let punchOut = '—';
  const formatPunch = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };
  try {
    const data = await apiFn('/api/attendance/today');
    punchIn = formatPunch(data.record && data.record.punchin);
    punchOut = formatPunch(data.record && data.record.punchout);
  } catch (_e) {}
  HRMS.syncPortalUserIdentity(user, punchIn, punchOut);
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
        list.innerHTML = '<p class="notif-empty">No notifications</p>';
        return;
      }
      const visible = items.filter((n) => !n.isRead);
      if (!visible.length) {
        list.innerHTML = '<p class="notif-empty">No notifications</p>';
        return;
      }
      list.innerHTML = visible
        .map((n) => {
          const safeMsg = String(n.message || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
          return `<button type="button" class="notif-row" data-notif-id="${n.id}" data-read="0" data-notif-type="${String(n.type || '').replace(/"/g, '')}" data-notif-msg="${safeMsg}">
              <span class="notif-icon">${n.type === 'birthday' ? '🎂' : n.type === 'broadcast' ? '🔔' : '•'}</span>
              <span class="notif-msg">${safeMsg}</span>
            </button>`;
        })
        .join('');
      list.querySelectorAll('.notif-row').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.getAttribute('data-notif-id'));
          const type = btn.getAttribute('data-notif-type') || '';
          const message = btn.getAttribute('data-notif-msg') || '';
          btn.remove();
          if (!list.querySelector('.notif-row')) {
            list.innerHTML = '<p class="notif-empty">No notifications</p>';
          }
          const unreadLeft = list.querySelectorAll('.notif-row[data-read="0"]').length;
          if (badge) {
            badge.textContent = unreadLeft > 9 ? '9+' : String(unreadLeft);
            badge.classList.toggle('hidden', unreadLeft === 0);
          }
          panel.classList.remove('is-open');
          try {
            await apiFn(`/api/notifications/${id}/read`, { method: 'PATCH' });
          } catch (_e) {}
          if (HRMS.navigateForNotification) {
            HRMS.navigateForNotification(type, message);
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
