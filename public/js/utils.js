window.HRMS = window.HRMS || {};

HRMS.MIN_PORTAL_YEAR = 2026;
HRMS.MAX_PORTAL_YEAR = 2100;

HRMS.clampPortalYear = function clampPortalYear(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return Math.max(new Date().getFullYear(), HRMS.MIN_PORTAL_YEAR);
  }
  return Math.min(HRMS.MAX_PORTAL_YEAR, Math.max(HRMS.MIN_PORTAL_YEAR, Math.floor(n)));
};

HRMS.currentPortalYear = function currentPortalYear() {
  return Math.max(new Date().getFullYear(), HRMS.MIN_PORTAL_YEAR);
};

HRMS.formatDateTime = function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
};

/** DD MMM YYYY — consistent across portals */
HRMS.formatDisplayDate = function formatDisplayDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

HRMS.badge = function badge(status, extraClass) {
  const normalized = (status || 'absent').toLowerCase().replace(/\s+/g, '');
  const map = {
    present: 'present',
    halfday: 'halfday',
    absent: 'absent',
    leave: 'leave',
    pending: 'pending',
    approved: 'approved',
    rejected: 'rejected'
  };
  const cls = map[normalized] || 'absent';
  const label = status || 'absent';
  const pretty =
    normalized === 'present'
      ? 'Present'
      : normalized === 'halfday'
        ? 'Half Day'
        : String(label).replace(/^\w/, (c) => c.toUpperCase());
  return `<span class="badge ${cls} ${extraClass || ''}">${pretty}</span>`;
};
// ADD this function — reused by all role dashboards
async function uploadProfileImage(fileInput, userId) {
  const file = fileInput.files[0];
  if (!file) return null;

  const formData = new FormData();
  formData.append('avatar', file);

  const res = await fetch('/api/users/profile', {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${getToken()}` },
    // DO NOT set Content-Type — browser sets it with boundary automatically
    body: formData
  });

  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.avatar_url;
}
HRMS.initTableSearch = function initTableSearch(tableId, searchInputId) {
  const table = document.getElementById(tableId);
  const input = document.getElementById(searchInputId);
  if (!table || !input) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    tbody.querySelectorAll('tr').forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = !q || text.includes(q) ? '' : 'none';
    });
  });
};

HRMS.paginateTable = function paginateTable(tableId, pageSize = 10) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll('tr'));
  let page = 0;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  function render() {
    const start = page * pageSize;
    rows.forEach((row, i) => {
      row.style.display = i >= start && i < start + pageSize ? '' : 'none';
    });
    const el = document.getElementById(`${tableId}-pagination`);
    if (el) el.textContent = `Page ${page + 1} of ${totalPages}`;
  }

  render();
  window[`${tableId}_next`] = () => {
    if (page < totalPages - 1) {
      page += 1;
      render();
    }
  };
  window[`${tableId}_prev`] = () => {
    if (page > 0) {
      page -= 1;
      render();
    }
  };
};
