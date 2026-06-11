/**
 * Manager assignments + manager directory (admin dashboard panels & standalone pages).
 */
(function () {
  function managerOption(manager) {
    return `<option value="${manager.id}">${manager.name} (${manager.email})</option>`;
  }

  function employeeOption(employee) {
    const manager = employee.managername ? ` — ${employee.managername}` : ' — unassigned';
    return `<option value="${employee.employeeid}">#${employee.employeeid} · ${employee.employeename}${manager}</option>`;
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

    function syncManagerSelects(managers) {
      const options = managers.length
        ? managers.map(managerOption).join('')
        : '<option value="">No managers available</option>';
      ['maManagerSelect', 'maSingleManagerSelect'].forEach((id) => {
        const select = el(id);
        if (select) select.innerHTML = options;
      });
    }

    function syncEmployeeSelect(assignments) {
      const select = el('maSingleEmployeeSelect');
      if (!select) return;
      select.innerHTML = assignments.length
        ? assignments.map(employeeOption).join('')
        : '<option value="">No employees found</option>';
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
        syncManagerSelects(managers);
        syncEmployeeSelect(assignments);
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
              <td>${row.employeeid}</td>
              <td>${row.employeename}</td>
              <td>${row.employeeemail}</td>
              <td>${row.department || '—'}</td>
              <td>${row.managername ? `${row.managername} (${row.manageremail})` : '—'}</td>
              <td><button type="button" class="btn btn-outline btn-sm" data-ma-remove="${row.employeeid}">Remove</button></td>
            </tr>`
            )
            .join('');

          tbody.querySelectorAll('[data-ma-remove]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const id = Number(btn.getAttribute('data-ma-remove'));
              try {
                await apiFn(`/api/admin/manager-assignments/${id}`, { method: 'DELETE' });
                await loadAssignments();
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
        const managerid = Number(el('maManagerSelect')?.value);
        const employeeids = (el('maEmployeeIdsInput')?.value || '')
          .split(',')
          .map((v) => Number(v.trim()))
          .filter((n) => Number.isFinite(n) && n > 0);
        const msg = el('maAssignMessage');
        if (msg) msg.textContent = '';
        if (!managerid) {
          if (msg) msg.textContent = 'Select a manager first.';
          return;
        }
        try {
          const result = await apiFn('/api/admin/manager-assignments/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ managerid, employeeids }),
          });
          if (msg) msg.textContent = `Assigned: ${result.assigned}, Failed: ${result.failed}`;
          HRMS.toast('Assignments updated', 'success');
          await loadAssignments();
        } catch (error) {
          if (msg) msg.textContent = error.message;
          HRMS.toast(error.message, 'error');
        }
      });
      el('maSingleAssignForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const managerid = Number(el('maSingleManagerSelect')?.value);
        const employeeid = Number(el('maSingleEmployeeSelect')?.value);
        const msg = el('maSingleAssignMessage');
        if (msg) msg.textContent = '';
        if (!managerid || !employeeid) {
          if (msg) msg.textContent = 'Select both manager and employee.';
          return;
        }
        try {
          await apiFn('/api/admin/manager-assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ managerid, employeeid }),
          });
          if (msg) msg.textContent = 'Employee assigned successfully.';
          HRMS.toast('Assignment added', 'success');
          await loadAssignments();
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
          return `<article class="manager-card">${img}<div><h3>${m.name || '—'}</h3><p class="manager-meta"><strong>Email:</strong> ${m.email || '—'}</p><p class="manager-meta"><strong>Department:</strong> ${m.department || '—'}</p><p class="manager-meta"><strong>Join date:</strong> ${join}</p></div></article>`;
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
            (m.email || '').toLowerCase().includes(q)
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
