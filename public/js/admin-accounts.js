/**
 * Super Admin — Manage Admins UI (admin-dashboard).
 */
(function () {
  const PERMS = window.HRMS_ADMIN_PERMS;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]);
  }

  function permissionSummary(permissions) {
    if (!permissions?.length) return 'No modules';
    if (permissions.length >= 8) return 'Most modules';
    return permissions
      .slice(0, 3)
      .map((p) => p.replace(/_/g, ' '))
      .join(', ')
      .concat(permissions.length > 3 ? ` +${permissions.length - 3}` : '');
  }

  function renderChecklist(container, modules, selected) {
    const set = new Set(selected || []);
    container.innerHTML = modules
      .map(
        (m) => `
      <label class="perm-check" style="display:flex;align-items:center;gap:8px;margin:6px 0;">
        <input type="checkbox" data-module="${escapeHtml(m.key)}" ${set.has(m.key) ? 'checked' : ''} />
        <span>${escapeHtml(m.label)}</span>
      </label>`
      )
      .join('');
  }

  function selectedModules(root) {
    return [...root.querySelectorAll('input[data-module]:checked')].map((el) => el.getAttribute('data-module'));
  }

  async function loadAdminAccounts(api) {
    const body = document.getElementById('manageAdminsBody');
    const msg = document.getElementById('manageAdminsMessage');
    if (!body) return;
    if (msg) msg.textContent = '';
    const [accountsData, modulesData] = await Promise.all([
      api('/api/admin/accounts'),
      api('/api/admin/accounts/modules'),
    ]);
    const modules = modulesData.modules || [];
    window.__adminModules = modules;

    body.innerHTML = (accountsData.admins || [])
      .map((admin) => {
        const status = admin.isActive ? 'Active' : 'Inactive';
        const badge = admin.isSuperAdmin ? 'Super Admin' : permissionSummary(admin.permissions);
        const actions = admin.isSuperAdmin
          ? '<span class="stat-sub">Protected</span>'
          : `<button type="button" class="btn btn-outline btn-sm" data-edit-admin="${admin.id}">Edit</button>
             <button type="button" class="btn btn-outline btn-sm" data-toggle-admin="${admin.id}" data-active="${admin.isActive}">${admin.isActive ? 'Deactivate' : 'Activate'}</button>
             <button type="button" class="btn btn-outline btn-sm" data-delete-admin="${admin.id}">Delete</button>`;
        return `<tr>
          <td>${escapeHtml(admin.name)}</td>
          <td>${escapeHtml(admin.designation || '—')}</td>
          <td>${escapeHtml(admin.department || '—')}</td>
          <td>${escapeHtml(admin.email)}</td>
          <td>${escapeHtml(status)}</td>
          <td>${escapeHtml(badge)}</td>
          <td style="display:flex;gap:6px;flex-wrap:wrap;">${actions}</td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('[data-edit-admin]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const admin = accountsData.admins.find((a) => String(a.id) === btn.getAttribute('data-edit-admin'));
        if (!admin) return;
        document.getElementById('editAdminId').value = String(admin.id);
        document.getElementById('editAdminName').value = admin.name;
        document.getElementById('editAdminDesignation').value = admin.designation || '';
        document.getElementById('editAdminDepartment').value = admin.department || '';
        document.getElementById('editAdminActive').checked = admin.isActive;
        renderChecklist(document.getElementById('editAdminPermissions'), modules, admin.permissions);
        document.getElementById('editAdminPanel')?.classList.remove('hidden');
      });
    });

    body.querySelectorAll('[data-toggle-admin]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-toggle-admin');
        const admin = accountsData.admins.find((a) => String(a.id) === id);
        if (!admin) return;
        try {
          await api(`/api/admin/accounts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: !admin.isActive }),
          });
          HRMS.toast('Admin status updated', 'success');
          await loadAdminAccounts(api);
        } catch (e) {
          HRMS.toast(e.message || 'Update failed', 'error');
        }
      });
    });

    body.querySelectorAll('[data-delete-admin]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete-admin');
        if (!window.confirm('Delete this admin account?')) return;
        try {
          await api(`/api/admin/accounts/${id}`, { method: 'DELETE' });
          HRMS.toast('Admin deleted', 'success');
          await loadAdminAccounts(api);
        } catch (e) {
          HRMS.toast(e.message || 'Delete failed', 'error');
        }
      });
    });
  }

  function initManageAdmins(api) {
    const user = PERMS.readAdminUser();
    if (!PERMS.isSuperAdmin(user)) return;

    const createChecklist = document.getElementById('createAdminPermissions');
    if (createChecklist && window.__adminModules) {
      renderChecklist(createChecklist, window.__adminModules, []);
    }

    document.getElementById('createAdminForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('manageAdminsMessage');
      try {
        await api('/api/admin/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.getElementById('createAdminName').value.trim(),
            email: document.getElementById('createAdminEmail').value.trim(),
            password: document.getElementById('createAdminPassword').value,
            designation: document.getElementById('createAdminDesignation').value.trim(),
            department: document.getElementById('createAdminDepartment').value.trim(),
            permissions: selectedModules(document.getElementById('createAdminForm')),
          }),
        });
        HRMS.toast('Admin created', 'success');
        e.target.reset();
        renderChecklist(createChecklist, window.__adminModules, []);
        if (msg) msg.textContent = '';
        await loadAdminAccounts(api);
      } catch (err) {
        if (msg) msg.textContent = err.message;
        HRMS.toast(err.message || 'Create failed', 'error');
      }
    });

    document.getElementById('editAdminForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editAdminId').value;
      const msg = document.getElementById('manageAdminsMessage');
      try {
        await api(`/api/admin/accounts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.getElementById('editAdminName').value.trim(),
            designation: document.getElementById('editAdminDesignation').value.trim(),
            department: document.getElementById('editAdminDepartment').value.trim(),
            isActive: document.getElementById('editAdminActive').checked,
            password: document.getElementById('editAdminPassword').value || undefined,
            permissions: selectedModules(document.getElementById('editAdminForm')),
          }),
        });
        HRMS.toast('Admin updated', 'success');
        document.getElementById('editAdminPanel')?.classList.add('hidden');
        await loadAdminAccounts(api);
      } catch (err) {
        if (msg) msg.textContent = err.message;
        HRMS.toast(err.message || 'Update failed', 'error');
      }
    });

    document.getElementById('cancelEditAdminBtn')?.addEventListener('click', () => {
      document.getElementById('editAdminPanel')?.classList.add('hidden');
    });

    document.getElementById('refreshManageAdminsBtn')?.addEventListener('click', () => {
      loadAdminAccounts(api).catch((e) => HRMS.toast(e.message, 'error'));
    });

    api('/api/admin/accounts/modules')
      .then((data) => {
        window.__adminModules = data.modules || [];
        renderChecklist(createChecklist, window.__adminModules, []);
      })
      .catch(() => {});
  }

  window.HRMS.initManageAdmins = function (api) {
    initManageAdmins(api);
    if (PERMS.isSuperAdmin(PERMS.readAdminUser())) {
      loadAdminAccounts(api).catch(() => {});
    }
  };
})();
