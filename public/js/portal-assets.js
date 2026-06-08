/**
 * Asset management UI — shared by admin (full) and manager (read-only) dashboards.
 * Expects: api(), HRMS.toast, HRMS.formatDisplayDate (optional)
 */
(function () {
  window.HRMS = window.HRMS || {};

  function fmtDate(value) {
    if (HRMS.formatDisplayDate) return HRMS.formatDisplayDate(value);
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function apiJson(api, path, options) {
    const opts = { ...(options || {}) };
    if (opts.body && typeof opts.body === 'string') {
      opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    }
    return api(path, opts);
  }

  function isAdminRole(role) {
    const r = String(role || '').toLowerCase();
    return r === 'admin' || r === 'founder' || r === 'it_head';
  }

  HRMS.initAssetManagement = function initAssetManagement(opts) {
    const role = String(opts.role || 'manager').toLowerCase();
    const isAdmin = isAdminRole(role);
    const api = opts.api;

    const invBody = document.getElementById('assetInventoryBody');
    const allocBody = document.getElementById('assetAllocationsBody');
    const invForm = document.getElementById('assetAddForm');
    const allocForm = document.getElementById('assetAllocateForm');
    const employeeSelect = document.getElementById('assetAllocateEmployee');
    const adminPanels = document.querySelectorAll('[data-asset-admin-only]');

    adminPanels.forEach((el) => {
      el.classList.toggle('hidden', !isAdmin);
    });

    async function loadEmployees() {
      if (!isAdmin || !employeeSelect) return;
      try {
        const data = await api('/api/assets/employees-options');
        const list = data.employees || [];
        employeeSelect.innerHTML =
          '<option value="">Select employee…</option>' +
          list
            .map(
              (e) =>
                `<option value="${e.id}">${esc(e.name)} (${esc(e.employeecode || e.id)})</option>`
            )
            .join('');
      } catch (e) {
        HRMS.toast(e.message || 'Could not load employees', 'error');
      }
    }

    async function loadInventory() {
      if (!invBody) return;
      invBody.innerHTML = '<tr><td colspan="6" class="stat-sub">Loading…</td></tr>';
      try {
        const data = await api('/api/assets/inventory');
        const items = data.items || [];
        if (!items.length) {
          invBody.innerHTML =
            '<tr><td colspan="6" class="stat-sub">No inventory items yet. Use the form above to add one.</td></tr>';
          return;
        }
        invBody.innerHTML = items
          .map((row) => {
            const editCell = isAdmin
              ? `<td class="filters-inline" style="gap:6px;flex-wrap:wrap;">
                  <button type="button" class="btn btn-outline btn-sm" data-edit-item="${row.id}"
                    data-name="${String(row.name || '').replace(/"/g, '&quot;')}"
                    data-category="${String(row.category || '').replace(/"/g, '&quot;')}"
                    data-total="${row.totalCount}">Edit</button>
                  <button type="button" class="btn btn-outline btn-sm" data-del-item="${row.id}">Remove</button>
                </td>`
              : '<td class="stat-sub">—</td>';
            return `<tr>
              <td>${esc(row.name)}</td>
              <td>${esc(row.category)}</td>
              <td>${row.totalCount}</td>
              <td>${row.allocatedCount}</td>
              <td>${row.availableCount}</td>
              ${editCell}
            </tr>`;
          })
          .join('');

        invBody.querySelectorAll('[data-edit-item]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-edit-item');
            const name = window.prompt('Item name:', btn.getAttribute('data-name') || '');
            if (name == null) return;
            const category = window.prompt('Category:', btn.getAttribute('data-category') || '');
            if (category == null) return;
            const totalNext = window.prompt('Total count:', btn.getAttribute('data-total') || '0');
            if (totalNext == null) return;
            const totalCount = Number(totalNext);
            if (!name.trim() || !category.trim()) {
              HRMS.toast('Name and category are required', 'error');
              return;
            }
            if (!Number.isFinite(totalCount) || totalCount < 0) {
              HRMS.toast('Enter a valid total count', 'error');
              return;
            }
            try {
              await apiJson(api, `/api/assets/inventory/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  name: name.trim(),
                  category: category.trim(),
                  totalCount,
                }),
              });
              HRMS.toast('Item updated', 'success');
              await refresh();
            } catch (e) {
              HRMS.toast(e.message, 'error');
            }
          });
        });

        invBody.querySelectorAll('[data-del-item]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-del-item');
            if (!window.confirm('Remove this inventory item? Active allocations must be revoked first.')) return;
            try {
              await apiJson(api, `/api/assets/inventory/${id}`, { method: 'DELETE' });
              HRMS.toast('Item removed', 'success');
              await refresh();
            } catch (e) {
              HRMS.toast(e.message, 'error');
            }
          });
        });
      } catch (e) {
        invBody.innerHTML = `<tr><td colspan="6" class="stat-sub">${esc(e.message)}</td></tr>`;
      }
    }

    async function loadAllocations() {
      if (!allocBody) return;
      allocBody.innerHTML = '<tr><td colspan="6" class="stat-sub">Loading…</td></tr>';
      try {
        const data = await api('/api/assets/allocations');
        const rows = data.allocations || [];
        if (!rows.length) {
          allocBody.innerHTML =
            '<tr><td colspan="6" class="stat-sub">No assets allocated yet.</td></tr>';
          return;
        }
        allocBody.innerHTML = rows
          .map((row) => {
            const action =
              isAdmin && row.status === 'active'
                ? `<button type="button" class="btn btn-outline btn-sm" data-revoke="${row.id}">Revoke</button>`
                : '—';
            return `<tr>
              <td>${esc(row.employeeName)}</td>
              <td>${esc(row.itemName)}</td>
              <td>${fmtDate(row.allocatedAt)}</td>
              <td>${esc(row.status)}</td>
              <td>${esc(row.notes || '—')}</td>
              <td>${action}</td>
            </tr>`;
          })
          .join('');

        allocBody.querySelectorAll('[data-revoke]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-revoke');
            if (!window.confirm('Mark this allocation as returned?')) return;
            try {
              await apiJson(api, `/api/assets/allocations/${id}/revoke`, { method: 'PATCH', body: '{}' });
              HRMS.toast('Allocation returned', 'success');
              await refresh();
            } catch (e) {
              HRMS.toast(e.message, 'error');
            }
          });
        });
      } catch (e) {
        allocBody.innerHTML = `<tr><td colspan="6" class="stat-sub">${esc(e.message)}</td></tr>`;
      }
    }

    if (isAdmin && invForm && invForm.dataset.assetBound !== '1') {
      invForm.dataset.assetBound = '1';
      invForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const name = document.getElementById('assetItemName')?.value?.trim();
        const category = document.getElementById('assetItemCategory')?.value?.trim();
        const totalCount = Number(document.getElementById('assetItemTotal')?.value);
        if (!name || !category) {
          HRMS.toast('Name and category are required', 'error');
          return;
        }
        try {
          await apiJson(api, '/api/assets/inventory', {
            method: 'POST',
            body: JSON.stringify({ name, category, totalCount }),
          });
          HRMS.toast('Item added', 'success');
          invForm.reset();
          await refresh();
        } catch (e) {
          HRMS.toast(e.message, 'error');
        }
      });
    }

    if (isAdmin && allocForm && allocForm.dataset.assetBound !== '1') {
      allocForm.dataset.assetBound = '1';
      allocForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const inventoryItemId = Number(document.getElementById('assetAllocateItem')?.value);
        const employeeId = Number(employeeSelect?.value);
        const notes = document.getElementById('assetAllocateNotes')?.value?.trim() || null;
        const allocatedAt = document.getElementById('assetAllocateDate')?.value;
        if (!inventoryItemId || !employeeId) {
          HRMS.toast('Select item and employee', 'error');
          return;
        }
        try {
          await apiJson(api, '/api/assets/allocations', {
            method: 'POST',
            body: JSON.stringify({
              inventoryItemId,
              employeeId,
              notes,
              allocatedAt: allocatedAt ? new Date(allocatedAt).toISOString() : undefined,
            }),
          });
          HRMS.toast('Asset allocated', 'success');
          allocForm.reset();
          await refresh();
        } catch (e) {
          HRMS.toast(e.message, 'error');
        }
      });
    }

    async function refresh() {
      await Promise.all([loadInventory(), loadAllocations(), loadEmployees()]);
      if (isAdmin && document.getElementById('assetAllocateItem')) {
        try {
          const data = await api('/api/assets/inventory');
          const items = data.items || [];
          const sel = document.getElementById('assetAllocateItem');
          sel.innerHTML =
            '<option value="">Select item…</option>' +
            items
              .filter((i) => i.availableCount > 0)
              .map(
                (i) =>
                  `<option value="${i.id}">${esc(i.name)} (${i.availableCount} available)</option>`
              )
              .join('');
        } catch (_) {}
      }
    }

    HRMS.refreshAssetManagement = refresh;
    return refresh();
  };
})();
