window.HRMS = window.HRMS || {};

HRMS.formatDateTime = function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
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
  return `<span class="badge ${cls} ${extraClass || ''}">${String(label).replace(/^\w/, (c) => c.toUpperCase())}</span>`;
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
