/**
 * Manager assignments + manager directory (admin dashboard panels & standalone pages).
 */
(function () {
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function downloadSampleCsv(filename, headers, rows) {
    const escCell = (v) => {
      const s = String(v ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.map(escCell).join(','),
      ...rows.map((row) => headers.map((h) => escCell(row[h] ?? '')).join(',')),
    ];
    const blob = new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  function assignmentKey(code) {
    return String(code || '').trim();
  }

  function maComboboxLabel(item, assignmentByCode) {
    const code = item.employeecode || '';
    const name = item.name || item.employeename || '';
    const base = code && name ? `${code} · ${name}` : code || name || '—';
    const row = assignmentByCode?.get(assignmentKey(code));
    if (row?.managername) {
      return `${base} — assigned to ${row.managercode || '—'} · ${row.managername}`;
    }
    return base;
  }

  function refreshOrgChart() {
    try {
      window.HRMS?.refreshTeamHubPanels?.();
    } catch (_) {
      /* ignore */
    }
  }

  function initMaCombobox(wrap, { multi = false } = {}) {
    const input = wrap?.querySelector('input');
    const list = wrap?.querySelector('.ma-combobox-list');
    const chips = multi ? wrap?.querySelector('.ma-multi-combobox-chips') : null;
    if (!input || !list) return null;

    let items = [];
    let assignmentByCode = new Map();
    let activeIdx = -1;
    let selected = [];

    function matches(item, q) {
      if (!q) return true;
      const code = String(item.employeecode || '').toLowerCase();
      const name = String(item.name || item.employeename || '').toLowerCase();
      const email = String(item.email || item.employeeemail || '').toLowerCase();
      return code.includes(q) || name.includes(q) || email.includes(q);
    }

    function renderChips() {
      if (!chips) return;
      chips.innerHTML = selected
        .map(
          (s, idx) =>
            `<span class="ma-multi-chip">${esc(s.label)}<button type="button" data-remove-idx="${idx}" aria-label="Remove">×</button></span>`
        )
        .join('');
      chips.querySelectorAll('[data-remove-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-remove-idx'));
          selected = selected.filter((_, i) => i !== idx);
          renderChips();
        });
      });
    }

    function renderList() {
      const q = input.value.trim().toLowerCase();
      const selectedCodes = new Set(selected.map((s) => assignmentKey(s.code)));
      const filtered = items
        .filter((item) => matches(item, q))
        .filter((item) => !multi || !selectedCodes.has(assignmentKey(item.employeecode)))
        .slice(0, 60);
      if (!filtered.length) {
        list.innerHTML = '<li class="ma-combobox-empty">No matches</li>';
        list.classList.remove('hidden');
        return;
      }
      list.innerHTML = filtered
        .map((item, i) => {
          const label = maComboboxLabel(item, assignmentByCode);
          return `<li class="ma-combobox-option${i === activeIdx ? ' is-active' : ''}" role="option" data-code="${esc(item.employeecode || '')}" data-label="${esc(label)}">${esc(label)}</li>`;
        })
        .join('');
      list.classList.remove('hidden');
    }

    function hideList() {
      list.classList.add('hidden');
      activeIdx = -1;
    }

    function pickOption(li) {
      const code = li.getAttribute('data-code') || '';
      const label = li.getAttribute('data-label') || code;
      if (multi) {
        if (!selected.some((s) => assignmentKey(s.code) === assignmentKey(code))) {
          selected.push({ code, label });
          renderChips();
        }
        input.value = '';
        delete input.dataset.code;
        hideList();
        input.focus();
        return;
      }
      input.value = label;
      input.dataset.code = code;
      hideList();
    }

    function resolveCode(raw) {
      if (!raw) return '';
      const exact = items.find((it) => assignmentKey(it.employeecode) === assignmentKey(raw));
      if (exact) return exact.employeecode;
      const labelHit = items.find(
        (it) => maComboboxLabel(it, assignmentByCode).toLowerCase() === raw.toLowerCase()
      );
      if (labelHit) return labelHit.employeecode;
      const prefix = raw.match(/^([A-Za-z0-9_-]+)\s*·/);
      if (prefix) return prefix[1];
      const q = raw.toLowerCase();
      const partial = items.filter((it) => matches(it, q));
      if (partial.length === 1) return partial[0].employeecode;
      return raw.split(/[·,]/)[0].trim();
    }

    input.addEventListener('focus', () => {
      activeIdx = -1;
      renderList();
    });

    input.addEventListener('input', () => {
      delete input.dataset.code;
      activeIdx = -1;
      renderList();
    });

    input.addEventListener('keydown', (e) => {
      const options = [...list.querySelectorAll('.ma-combobox-option')];
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (list.classList.contains('hidden')) renderList();
        activeIdx = Math.min(activeIdx + 1, options.length - 1);
        renderList();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        renderList();
      } else if (e.key === 'Enter' && !list.classList.contains('hidden') && activeIdx >= 0 && options[activeIdx]) {
        e.preventDefault();
        pickOption(options[activeIdx]);
      } else if (e.key === 'Escape') {
        hideList();
      }
    });

    list.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const li = e.target.closest('.ma-combobox-option');
      if (li) pickOption(li);
    });

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) hideList();
    });

    return {
      setItems(next) {
        items = Array.isArray(next) ? next.filter((item) => item.employeecode) : [];
      },
      setAssignmentMap(map) {
        assignmentByCode = map instanceof Map ? map : new Map();
      },
      getCode() {
        if (input.dataset.code) return input.dataset.code.trim();
        return resolveCode(input.value.trim());
      },
      getCodes() {
        return selected.map((s) => s.code).filter(Boolean);
      },
      clear() {
        input.value = '';
        delete input.dataset.code;
        selected = [];
        renderChips();
        hideList();
      },
    };
  }

  function setLoading(loading, empty, wrap, isLoading) {
    if (loading) loading.classList.toggle('hidden', !isLoading);
    if (empty && isLoading) empty.classList.add('hidden');
    if (wrap && isLoading) wrap.classList.add('hidden');
  }

  HRMS.initManagerAssignments = function initManagerAssignments(apiFn, root) {
    const panel = root || document.getElementById('view-manager-assignments');
    if (!panel) return;

    const el = (id) => panel.querySelector(`#${id}`);
    let maImportReady = false;
    const singleManagerCombo = initMaCombobox(el('maSingleManagerCombo'));
    const singleEmployeeCombo = initMaCombobox(el('maSingleEmployeeCombo'));
    const bulkManagerCombo = initMaCombobox(el('maBulkManagerCombo'));
    const bulkEmployeeCombo = initMaCombobox(el('maBulkEmployeeCombo'), { multi: true });

    function syncComboboxes(managers, assignments) {
      const assignmentMap = new Map(
        assignments.filter((a) => a.employeecode).map((a) => [assignmentKey(a.employeecode), a])
      );
      singleManagerCombo?.setItems(managers);
      bulkManagerCombo?.setItems(managers);
      singleEmployeeCombo?.setItems(assignments);
      bulkEmployeeCombo?.setItems(assignments);
      singleEmployeeCombo?.setAssignmentMap(assignmentMap);
      bulkEmployeeCombo?.setAssignmentMap(assignmentMap);
    }

    function managerAssignmentFormData(file) {
      const formData = new FormData();
      formData.append('file', file);
      return formData;
    }

    async function loadAssignments() {
      const url = '/api/admin/manager-assignments';

      const loading = el('maAssignmentsLoading');
      const empty = el('maAssignmentsEmpty');
      const wrap = el('maAssignmentsTableWrap');
      const tbody = el('maAssignmentBody');
      setLoading(loading, empty, wrap, true);

      try {
        const data = await apiFn(url);
        const managers = data.managers || [];
        const assignments = data.assignments || [];
        syncComboboxes(managers, assignments);
        if (loading) loading.classList.add('hidden');

        if (!assignments.length) {
          if (empty) {
            empty.classList.remove('hidden');
            empty.textContent = 'No employees found.';
          }
          if (wrap) wrap.classList.add('hidden');
          if (tbody) tbody.innerHTML = '';
          return;
        }

        if (empty) empty.classList.add('hidden');
        if (wrap) wrap.classList.remove('hidden');
        if (tbody) {
          tbody.innerHTML = assignments
            .map(
              (row) => `
            <tr>
              <td>${esc(row.employeecode || '—')}</td>
              <td>${esc(row.employeename)}</td>
              <td>${esc(row.employeeemail)}</td>
              <td>${esc(row.department || '—')}</td>
              <td>${
                row.managername
                  ? `${esc(row.managercode || '—')} · ${esc(row.managername)}`
                  : '<span class="stat-sub">Not assigned</span>'
              }</td>
              <td class="ma-actions-cell">${
                row.managerid
                  ? `<button type="button" class="btn btn-outline btn-sm" data-ma-remove="${row.employeeid}">Remove</button>`
                  : '<span class="stat-sub">—</span>'
              }</td>
            </tr>`
            )
            .join('');

          tbody.querySelectorAll('[data-ma-remove]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const id = Number(btn.getAttribute('data-ma-remove'));
              try {
                await apiFn(`/api/admin/manager-assignments/${id}`, { method: 'DELETE' });
                await loadAssignments();
                refreshOrgChart();
                HRMS.toast('Assignment removed', 'success');
              } catch (e) {
                HRMS.toast(e.message, 'error');
              }
            });
          });
        }
      } catch (e) {
        if (loading) loading.classList.add('hidden');
        HRMS.toast(e.message || 'Could not load assignments', 'error');
      }
    }

    if (panel.dataset.maBound !== '1') {
      panel.dataset.maBound = '1';

      el('maAssignForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const managerCode = bulkManagerCombo?.getCode() || (el('maManagerCode')?.value || '').trim();
        const employeeCodes = bulkEmployeeCombo?.getCodes() || [];
        const msg = el('maAssignMessage');
        if (msg) msg.textContent = '';
        if (!managerCode) {
          if (msg) msg.textContent = 'Select a manager.';
          return;
        }
        if (!employeeCodes.length) {
          if (msg) msg.textContent = 'Add at least one employee.';
          return;
        }
        try {
          const result = await apiFn('/api/admin/manager-assignments/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ managerCode, employeeCodes }),
          });
          if (msg) {
            const skipped = result.skipped ? `, Already assigned: ${result.skipped}` : '';
            msg.textContent = `Assigned: ${result.assigned}, Failed: ${result.failed}${skipped}`;
          }
          HRMS.toast('Assignments updated', 'success');
          bulkEmployeeCombo?.clear();
          await loadAssignments();
          refreshOrgChart();
        } catch (error) {
          if (msg) msg.textContent = error.message;
          HRMS.toast(error.message, 'error');
        }
      });

      el('maSingleAssignForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const managerCode = singleManagerCombo?.getCode() || (el('maSingleManagerCode')?.value || '').trim();
        const employeeCode = singleEmployeeCombo?.getCode() || (el('maSingleEmployeeCode')?.value || '').trim();
        const msg = el('maSingleAssignMessage');
        if (msg) msg.textContent = '';
        if (!managerCode || !employeeCode) {
          if (msg) msg.textContent = 'Enter both manager and employee emp codes.';
          return;
        }
        try {
          const result = await apiFn('/api/admin/manager-assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ managerCode, employeeCode }),
          });
          if (result.alreadyAssigned) {
            if (msg) msg.textContent = 'This employee is already assigned to this manager.';
            HRMS.toast('Already assigned to this manager', 'info');
          } else {
            if (msg) msg.textContent = 'Employee assigned successfully.';
            HRMS.toast('Assignment added', 'success');
          }
          singleEmployeeCombo?.clear();
          await loadAssignments();
          refreshOrgChart();
        } catch (error) {
          if (msg) msg.textContent = error.message;
          HRMS.toast(error.message, 'error');
        }
      });

      el('maImportSampleBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        downloadSampleCsv('manager-assignment-sample.csv', ['Emp code', 'Name', 'Reporting manager'], [
          { 'Emp code': '100', Name: 'Amit Sharma', 'Reporting manager': 'Ashish Mishra' },
          { 'Emp code': '101', Name: 'Priya Singh', 'Reporting manager': 'Ashish Mishra' },
        ]);
      });

      el('maImportFile')?.addEventListener('change', () => {
        maImportReady = false;
        const confirmBtn = el('maImportConfirmBtn');
        if (confirmBtn) confirmBtn.disabled = true;
        el('maImportPreview')?.classList.add('hidden');
        const file = el('maImportFile')?.files?.[0];
        const fileName = el('maImportFileName');
        if (fileName) fileName.textContent = file ? `Selected: ${file.name}` : 'No file selected.';
        const msg = el('maImportMessage');
        if (msg) msg.textContent = '';
      });

      el('maImportPreviewBtn')?.addEventListener('click', async () => {
        const file = el('maImportFile')?.files?.[0];
        const msg = el('maImportMessage');
        const preview = el('maImportPreview');
        const summary = el('maImportPreviewSummary');
        const body = el('maImportPreviewBody');
        const confirmBtn = el('maImportConfirmBtn');
        if (!file) {
          HRMS.toast('Choose a file first', 'error');
          return;
        }
        try {
          const result = await apiFn('/api/admin/manager-assignments/import/preview', {
            method: 'POST',
            body: managerAssignmentFormData(file),
          });
          maImportReady = true;
          if (msg) msg.textContent = '';
          if (summary) {
            const mapped = result.mappedFields || {};
            const mappedText =
              mapped.employeecode && mapped.reportingManager
                ? `Columns: ${mapped.employeecode} → Emp code, ${mapped.reportingManager} → Reporting manager. `
                : '';
            summary.textContent = `${mappedText}${result.totalrows} row(s): ${result.validCount ?? 0} ready, ${result.invalidCount ?? 0} invalid.`;
          }
          if (body) {
            body.innerHTML = (result.preview || [])
              .map(
                (row) => `
              <tr>
                <td>${esc(row.status)}</td>
                <td>${esc(row.employeecode)}</td>
                <td>${esc(row.employeeName || row.name || '—')}</td>
                <td>${esc(row.reportingManagerCode || row.reportingManagerValue || '—')}</td>
                <td>${esc(row.issues || (row.managerName ? `→ ${row.managerName}` : ''))}</td>
              </tr>`
              )
              .join('');
          }
          preview?.classList.remove('hidden');
          if (confirmBtn) confirmBtn.disabled = false;
          HRMS.toast('Preview ready', 'success');
        } catch (error) {
          maImportReady = false;
          preview?.classList.add('hidden');
          if (confirmBtn) confirmBtn.disabled = true;
          if (msg) msg.textContent = error.message;
          HRMS.toast(error.message, 'error');
        }
      });

      el('maImportConfirmBtn')?.addEventListener('click', async () => {
        const file = el('maImportFile')?.files?.[0];
        const msg = el('maImportMessage');
        if (!file) {
          HRMS.toast('Choose a file first', 'error');
          return;
        }
        if (!maImportReady) {
          HRMS.toast('Preview the file before importing', 'error');
          return;
        }
        try {
          const result = await apiFn('/api/admin/manager-assignments/import', {
            method: 'POST',
            body: managerAssignmentFormData(file),
          });
          const failed = result.failed || 0;
          if (msg) {
            msg.style.whiteSpace = 'pre-wrap';
            msg.textContent = `Assigned: ${result.assigned || 0}, Failed: ${failed}`;
            if (result.errors?.length) {
              const lines = result.errors
                .slice(0, 10)
                .map((e) => `Row ${e.row} (${e.employeecode}): ${e.error}`);
              msg.textContent += `\n${lines.join('\n')}${result.errors.length > 10 ? '\n…' : ''}`;
            }
          }
          HRMS.toast(
            `${result.assigned || 0} assigned, ${failed} failed`,
            failed ? 'warning' : 'success'
          );
          maImportReady = false;
          el('maImportConfirmBtn').disabled = true;
          el('maImportPreview')?.classList.add('hidden');
          el('maImportFile').value = '';
          el('maImportFileName').textContent = 'No file selected.';
          await loadAssignments();
          refreshOrgChart();
        } catch (error) {
          if (msg) msg.textContent = error.message;
          HRMS.toast(error.message, 'error');
        }
      });
    }
    panel._reloadManagerAssignments = loadAssignments;
    return loadAssignments();
  };

  HRMS.initManagerDirectory = function initManagerDirectory(apiFn, root) {
    const panel = root || document.getElementById('view-manager-directory');
    if (!panel) return;

    const loading = panel.querySelector('#mdManagersLoading');
    const empty = panel.querySelector('#mdManagersEmpty');
    const grid = panel.querySelector('#mdManagersGrid');
    const search = panel.querySelector('#mdManagerSearch');
    let allManagers = [];

    function render(list) {
      if (!grid || !empty || !loading) return;
      loading.classList.add('hidden');
      if (!list.length) {
        grid.classList.add('hidden');
        empty.classList.remove('hidden');
        empty.textContent = search?.value.trim()
          ? 'No managers match your search.'
          : 'No managers found.';
        return;
      }
      empty.classList.add('hidden');
      grid.classList.remove('hidden');
      grid.innerHTML = list
        .map((m) => {
          const initials = (m.name || '?')
            .split(/\s+/)
            .map((x) => x[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
          const img = m.profilePhotoUrl
            ? `<img class="manager-avatar" src="${m.profilePhotoUrl}" alt="" />`
            : `<div class="manager-avatar" aria-hidden="true">${initials}</div>`;
          const join = m.joinDate
            ? new Date(m.joinDate).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : '—';
          return `<article class="manager-card">${img}<div><h3>${m.name || '—'}</h3><p class="manager-meta"><strong>Emp code:</strong> ${esc(m.employeecode || '—')}</p><p class="manager-meta"><strong>Designation:</strong> ${esc(m.designation || '—')}</p><p class="manager-meta"><strong>Mobile:</strong> ${esc(m.phone || '—')}</p><p class="manager-meta"><strong>Email:</strong> ${esc(m.email || '—')}</p><p class="manager-meta"><strong>Department:</strong> ${esc(m.department || '—')}</p><p class="manager-meta"><strong>Join date:</strong> ${join}</p></div></article>`;
        })
        .join('');
    }

    function filterList() {
      const q = (search?.value || '').trim().toLowerCase();
      if (!q) return render(allManagers);
      render(
        allManagers.filter(
          (m) =>
            (m.name || '').toLowerCase().includes(q) ||
            (m.department || '').toLowerCase().includes(q) ||
            (m.email || '').toLowerCase().includes(q) ||
            (m.designation || '').toLowerCase().includes(q) ||
            (m.phone || '').toLowerCase().includes(q) ||
            (m.employeecode || '').toLowerCase().includes(q)
        )
      );
    }

    if (panel.dataset.mdBound !== '1') {
      panel.dataset.mdBound = '1';
      search?.addEventListener('input', filterList);
    }

    panel._reloadManagerDirectory = async () => {
      if (loading) {
        loading.classList.remove('hidden');
        loading.textContent = 'Loading managers…';
      }
      if (grid) grid.classList.add('hidden');
      if (empty) empty.classList.add('hidden');
      try {
        const data = await apiFn('/api/managers');
        allManagers = data.managers || [];
        filterList();
      } catch (e) {
        if (loading) loading.classList.add('hidden');
        if (empty) {
          empty.classList.remove('hidden');
          empty.textContent = e.message || 'Could not load managers.';
        }
        if (grid) grid.classList.add('hidden');
        HRMS.toast(e.message || 'Could not load managers', 'error');
      }
    };
    return panel._reloadManagerDirectory();
  };
})();
