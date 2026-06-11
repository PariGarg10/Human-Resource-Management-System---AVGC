/**
 * Policies & important links — admin (CRUD) and manager/employee (read-only visible).
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
    if (r === 'admin' || r === 'founder' || r === 'it_head') return true;
    try {
      const stored = JSON.parse(localStorage.getItem('employee') || '{}');
      const name = String(stored.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      return name === 'ashish mishra';
    } catch {
      return false;
    }
  }

  HRMS.initPoliciesPortal = function initPoliciesPortal(opts) {
    const role = String(opts.role || 'employee').toLowerCase();
    const isAdmin = isAdminRole(role);
    const api = opts.api;
    const token = localStorage.getItem('token');

    const listEl = document.getElementById('policiesList');
    const tableBody = document.getElementById('policiesAdminBody');
    const adminOnly = document.querySelectorAll('[data-policies-admin-only]');

    adminOnly.forEach((el) => el.classList.toggle('hidden', !isAdmin));
    if (listEl) listEl.classList.toggle('hidden', isAdmin);

    async function load() {
      try {
        const data = await api('/api/policies');
        const policies = data.policies || [];
        if (isAdmin && tableBody) {
          if (!policies.length) {
            tableBody.innerHTML =
              '<tr><td colspan="5" class="stat-sub">No policies or links yet. Add one using the forms above.</td></tr>';
          } else {
            tableBody.innerHTML = policies
              .map((p) => {
                const openUrl = p.type === 'link' ? p.externalUrl : p.fileUrl;
                return `<tr>
                  <td>${esc(p.title)}</td>
                  <td>${p.type === 'link' ? 'Link' : 'Policy'}</td>
                  <td>${fmtDate(p.createdAt)}</td>
                  <td>${p.isVisible ? 'Visible' : 'Hidden'}</td>
                  <td class="filters-inline" style="gap:6px;flex-wrap:wrap;">
                    ${openUrl ? `<a href="${esc(openUrl)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">Open</a>` : ''}
                    <button type="button" class="btn btn-outline btn-sm" data-edit-policy="${p.id}"
                      data-type="${esc(p.type)}" data-title="${esc(p.title)}"
                      data-desc="${esc(p.description || '')}" data-url="${esc(p.externalUrl || '')}">Edit</button>
                    <button type="button" class="btn btn-outline btn-sm" data-toggle-vis="${p.id}" data-vis="${p.isVisible ? '1' : '0'}">${p.isVisible ? 'Hide' : 'Show'}</button>
                    <button type="button" class="btn btn-outline btn-sm" data-del-policy="${p.id}">Remove</button>
                  </td>
                </tr>`;
              })
              .join('');
          }

          tableBody.querySelectorAll('[data-edit-policy]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const id = btn.getAttribute('data-edit-policy');
              const type = btn.getAttribute('data-type');
              const title = window.prompt('Title:', btn.getAttribute('data-title') || '');
              if (title == null) return;
              const description = window.prompt('Description (optional):', btn.getAttribute('data-desc') || '');
              if (description == null) return;
              const payload = {
                title: title.trim(),
                description: description.trim() || null,
              };
              if (type === 'link') {
                const externalUrl = window.prompt('URL:', btn.getAttribute('data-url') || 'https://');
                if (externalUrl == null) return;
                payload.externalUrl = externalUrl.trim();
              }
              if (!payload.title) {
                HRMS.toast('Title is required', 'error');
                return;
              }
              try {
                await apiJson(api, `/api/policies/${id}`, {
                  method: 'PATCH',
                  body: JSON.stringify(payload),
                });
                HRMS.toast('Updated', 'success');
                await load();
              } catch (e) {
                HRMS.toast(e.message, 'error');
              }
            });
          });

          tableBody.querySelectorAll('[data-toggle-vis]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const id = btn.getAttribute('data-toggle-vis');
              const vis = btn.getAttribute('data-vis') === '1';
              try {
                await apiJson(api, `/api/policies/${id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ isVisible: !vis }),
                });
                HRMS.toast('Visibility updated', 'success');
                await load();
              } catch (e) {
                HRMS.toast(e.message, 'error');
              }
            });
          });

          tableBody.querySelectorAll('[data-del-policy]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const id = btn.getAttribute('data-del-policy');
              if (!window.confirm('Remove this policy or link?')) return;
              try {
                await apiJson(api, `/api/policies/${id}`, { method: 'DELETE' });
                HRMS.toast('Removed', 'success');
                await load();
              } catch (e) {
                HRMS.toast(e.message, 'error');
              }
            });
          });
        }

        if (listEl && !isAdmin) {
          listEl.classList.remove('hidden');
          if (!policies.length) {
            listEl.innerHTML = '<p class="stat-sub">No policies added yet.</p>';
          } else {
            listEl.innerHTML = policies
              .map((p) => {
                const url = p.type === 'link' ? p.externalUrl : p.fileUrl;
                const badge = p.type === 'link' ? 'Link' : 'Policy';
                return `<div class="panel" style="margin-bottom:12px;padding:16px;">
                  <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;">
                    <div>
                      <span class="badge pending" style="margin-right:8px;">${badge}</span>
                      <strong>${esc(p.title)}</strong>
                      <p class="stat-sub" style="margin:6px 0 0;">${esc(p.description || '')}</p>
                      <p class="stat-sub" style="margin-top:4px;">Added ${fmtDate(p.createdAt)}</p>
                    </div>
                    ${
                      url
                        ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">${p.type === 'link' ? 'Open link' : 'Download'}</a>`
                        : ''
                    }
                  </div>
                </div>`;
              })
              .join('');
          }
        }
      } catch (e) {
        if (listEl && !isAdmin) listEl.innerHTML = `<p class="stat-sub">${esc(e.message)}</p>`;
        if (tableBody) {
          tableBody.innerHTML = `<tr><td colspan="5" class="stat-sub">${esc(e.message)}</td></tr>`;
        }
      }
    }

    const linkForm = document.getElementById('policyLinkForm');
    if (isAdmin && linkForm && linkForm.dataset.policyBound !== '1') {
      linkForm.dataset.policyBound = '1';
      linkForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const title = document.getElementById('policyLinkTitle')?.value?.trim();
        const externalUrl = document.getElementById('policyLinkUrl')?.value?.trim();
        const description = document.getElementById('policyLinkDesc')?.value?.trim() || null;
        try {
          await apiJson(api, '/api/policies/link', {
            method: 'POST',
            body: JSON.stringify({ title, externalUrl, description }),
          });
          HRMS.toast('Link added', 'success');
          ev.target.reset();
          await load();
        } catch (e) {
          HRMS.toast(e.message, 'error');
        }
      });
    }

    const uploadForm = document.getElementById('policyUploadForm');
    if (isAdmin && uploadForm && uploadForm.dataset.policyBound !== '1') {
      uploadForm.dataset.policyBound = '1';
      uploadForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const title = document.getElementById('policyDocTitle')?.value?.trim();
        const description = document.getElementById('policyDocDesc')?.value?.trim() || '';
        const fileInput = document.getElementById('policyDocFile');
        const file = fileInput?.files?.[0];
        if (!title || !file) {
          HRMS.toast('Title and file are required', 'error');
          return;
        }
        const fd = new FormData();
        fd.append('title', title);
        fd.append('description', description);
        fd.append('file', file);
        try {
          const res = await fetch('/api/policies/upload', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || 'Upload failed');
          HRMS.toast('Policy uploaded', 'success');
          ev.target.reset();
          await load();
        } catch (e) {
          HRMS.toast(e.message, 'error');
        }
      });
    }

    HRMS.refreshPoliciesPortal = load;
    return load();
  };
})();
