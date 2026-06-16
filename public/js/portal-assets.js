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
    const inventoryImportInput = document.getElementById('assetInventoryImportFile');
    const inventoryImportSampleBtn = document.getElementById('assetInventorySampleBtn');
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
        const msg = String(e?.message || '');
        if (!/forbidden|403/i.test(msg)) {
          HRMS.toast(msg || 'Could not load employees', 'error');
        }
      }
    }

    async function loadInventory() {
      if (!invBody) return;
      invBody.innerHTML = '<tr><td colspan="8" class="stat-sub">Loading…</td></tr>';
      try {
        const data = await api('/api/assets/inventory');
        const items = data.items || [];
        if (!items.length) {
          invBody.innerHTML =
            '<tr><td colspan="8" class="stat-sub">No inventory items yet. Use the form above to add one.</td></tr>';
          return;
        }
        invBody.innerHTML = items
          .map((row) => {
            const editCell = isAdmin
              ? `<td class="filters-inline" style="gap:6px;flex-wrap:wrap;">
                  <button type="button" class="btn btn-outline btn-sm" data-edit-item="${row.id}"
                    data-name="${String(row.name || '').replace(/"/g, '&quot;')}"
                    data-category="${String(row.category || '').replace(/"/g, '&quot;')}"
                    data-model-number="${String(row.modelNumber || '').replace(/"/g, '&quot;')}"
                    data-serial-number="${String(row.serialNumber || '').replace(/"/g, '&quot;')}"
                    data-total="${row.totalCount}">Edit</button>
                  <button type="button" class="btn btn-outline btn-sm" data-del-item="${row.id}">Remove</button>
                </td>`
              : '<td class="stat-sub">—</td>';
            return `<tr>
              <td>${esc(row.name)}</td>
              <td>${esc(row.category)}</td>
              <td>${esc(row.modelNumber || '—')}</td>
              <td>${esc(row.serialNumber || '—')}</td>
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
            const modelNumber = window.prompt('Model number:', btn.getAttribute('data-model-number') || '');
            if (modelNumber == null) return;
            const serialNumber = window.prompt('Serial number:', btn.getAttribute('data-serial-number') || '');
            if (serialNumber == null) return;
            const totalNext = window.prompt('Total count:', btn.getAttribute('data-total') || '0');
            if (totalNext == null) return;
            const totalCount = Number(totalNext);
            if (!name.trim() || !category.trim() || !modelNumber.trim() || !serialNumber.trim()) {
              HRMS.toast('Name, category, model number and serial number are required', 'error');
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
                  modelNumber: modelNumber.trim(),
                  serialNumber: serialNumber.trim(),
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
        invBody.innerHTML = `<tr><td colspan="8" class="stat-sub">${esc(e.message)}</td></tr>`;
      }
    }

    async function loadAllocations() {
      if (!allocBody) return;
      allocBody.innerHTML = '<tr><td colspan="8" class="stat-sub">Loading…</td></tr>';
      try {
        const data = await api('/api/assets/allocations');
        const rows = data.allocations || [];
        if (!rows.length) {
          allocBody.innerHTML =
            '<tr><td colspan="8" class="stat-sub">No assets allocated yet.</td></tr>';
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
              <td>${esc(row.modelNumber || '—')}</td>
              <td>${esc(row.serialNumber || '—')}</td>
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
        allocBody.innerHTML = `<tr><td colspan="8" class="stat-sub">${esc(e.message)}</td></tr>`;
      }
    }

    function downloadSampleExcel(filename, headers, rows) {
      const table = `
        <table>
          <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${headers.map((h) => `<td>${esc(row[h] || '')}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;
      const blob = new Blob([`<html><meta charset="utf-8"><body>${table}</body></html>`], {
        type: 'application/vnd.ms-excel;charset=utf-8;',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
    }

    if (isAdmin && invForm && invForm.dataset.assetBound !== '1') {
      invForm.dataset.assetBound = '1';
      invForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const name = document.getElementById('assetItemName')?.value?.trim();
        const category = document.getElementById('assetItemCategory')?.value?.trim();
        const modelNumber = document.getElementById('assetItemModelNumber')?.value?.trim();
        const serialNumber = document.getElementById('assetItemSerialNumber')?.value?.trim();
        const totalCount = Number(document.getElementById('assetItemTotal')?.value);
        if (!name || !category || !modelNumber || !serialNumber) {
          HRMS.toast('Name, category, model number and serial number are required', 'error');
          return;
        }
        try {
          await apiJson(api, '/api/assets/inventory', {
            method: 'POST',
            body: JSON.stringify({ name, category, modelNumber, serialNumber, totalCount }),
          });
          HRMS.toast('Item added', 'success');
          invForm.reset();
          await refresh();
        } catch (e) {
          HRMS.toast(e.message, 'error');
        }
      });

      inventoryImportSampleBtn?.addEventListener('click', (ev) => {
        ev.preventDefault();
        downloadSampleExcel(
          'asset-inventory-import-sample.xls',
          ['Device Type', 'Category', 'Model Number', 'Serial Number', 'Quantity', 'Assigned To'],
          [
            {
              'Device Type': 'Laptop',
              Category: 'IT Asset',
              'Model Number': 'LEN-T14-G5',
              'Serial Number': 'SN-2026-0001',
              Quantity: '5',
              'Assigned To': 'EMP001',
            },
          ]
        );
      });

      inventoryImportInput?.addEventListener('change', async () => {
        const file = inventoryImportInput.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        try {
          const result = await api('/api/assets/inventory/import', {
            method: 'POST',
            body: fd,
          });
          const failed = Number(result.failedrows || 0);
          const success = Number(result.successfulimports || 0);
          HRMS.toast(
            failed > 0
              ? `Imported ${success} row(s), ${failed} failed`
              : `Imported ${success} asset row(s) successfully`,
            failed > 0 ? 'warning' : 'success'
          );
          await refresh();
        } catch (e) {
          HRMS.toast(e.message || 'Could not import asset inventory', 'error');
        } finally {
          inventoryImportInput.value = '';
        }
      });
    }

    if (isAdmin && allocForm && allocForm.dataset.assetBound !== '1') {
      allocForm.dataset.assetBound = '1';
      allocForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const inventoryItemId = Number(document.getElementById('assetAllocateItem')?.value);
        const employeeId = Number(employeeSelect?.value);
        const modelNumber = document.getElementById('assetAllocateModelNumber')?.value?.trim() || null;
        const serialNumber = document.getElementById('assetAllocateSerialNumber')?.value?.trim() || null;
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
              modelNumber,
              serialNumber,
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
                  `<option value="${i.id}" data-model-number="${esc(i.modelNumber || '')}" data-serial-number="${esc(i.serialNumber || '')}">${esc(i.name)} (${i.availableCount} available)</option>`
              )
              .join('');
          if (sel.dataset.assetModelBound !== '1') {
            sel.dataset.assetModelBound = '1';
            sel.addEventListener('change', () => {
              const selected = sel.options[sel.selectedIndex];
              const modelField = document.getElementById('assetAllocateModelNumber');
              const serialField = document.getElementById('assetAllocateSerialNumber');
              if (modelField) modelField.value = selected?.getAttribute('data-model-number') || '';
              if (serialField) serialField.value = selected?.getAttribute('data-serial-number') || '';
            });
          }
          sel.dispatchEvent(new Event('change'));
        } catch (_) {}
      }
    }

    HRMS.refreshAssetManagement = refresh;
    return refresh();
  };
})();
