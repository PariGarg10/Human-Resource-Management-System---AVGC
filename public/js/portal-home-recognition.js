/**
 * Homepage Recognition — admin manages team leads & employees on public homepage.
 */
(function () {
  window.HRMS = window.HRMS || {};

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function avatarCell(item) {
    if (item.image) {
      return `<img src="${esc(item.image)}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;background:#ebebec;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
        <span style="display:none;width:40px;height:40px;border-radius:50%;background:#ebebec;align-items:center;justify-content:center;font-weight:700;color:#697279;font-size:0.75rem;">${esc(
          (item.name || '?')
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p.charAt(0).toUpperCase())
            .join('')
        )}</span>`;
    }
    const ini = (item.name || '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
    return `<span style="display:inline-flex;width:40px;height:40px;border-radius:50%;background:#ebebec;align-items:center;justify-content:center;font-weight:700;color:#697279;font-size:0.75rem;">${esc(
      ini
    )}</span>`;
  }

  function bindRowActions(tbody, api, token, load) {
    tbody.querySelectorAll('[data-edit-rec]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-edit-rec');
        const name = window.prompt('Full name:', btn.getAttribute('data-name') || '');
        if (name == null) return;
        const designation = window.prompt('Designation:', btn.getAttribute('data-designation') || '');
        if (designation == null) return;
        const sortOrder = window.prompt('Display order (lower = first):', btn.getAttribute('data-sort') || '0');
        if (sortOrder == null) return;
        if (!name.trim() || !designation.trim()) {
          HRMS.toast('Name and designation are required', 'error');
          return;
        }
        const fd = new FormData();
        fd.append('name', name.trim());
        fd.append('designation', designation.trim());
        fd.append('sortOrder', String(Number.parseInt(sortOrder, 10) || 0));
        try {
          const res = await fetch(`/api/home-recognition/${id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || 'Update failed');
          HRMS.toast('Updated', 'success');
          await load();
        } catch (e) {
          HRMS.toast(e.message, 'error');
        }
      });
    });

    tbody.querySelectorAll('[data-photo-rec]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-photo-rec');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp,image/gif';
        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.append('image', file);
          try {
            const res = await fetch(`/api/home-recognition/${id}`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}` },
              body: fd,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'Photo update failed');
            HRMS.toast('Photo updated', 'success');
            await load();
          } catch (e) {
            HRMS.toast(e.message, 'error');
          }
        });
        input.click();
      });
    });

    tbody.querySelectorAll('[data-toggle-rec]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-toggle-rec');
        const vis = btn.getAttribute('data-vis') === '1';
        const fd = new FormData();
        fd.append('isVisible', vis ? 'false' : 'true');
        try {
          const res = await fetch(`/api/home-recognition/${id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || 'Visibility update failed');
          HRMS.toast('Visibility updated', 'success');
          await load();
        } catch (e) {
          HRMS.toast(e.message, 'error');
        }
      });
    });

    tbody.querySelectorAll('[data-del-rec]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-rec');
        if (!window.confirm('Remove this person from the homepage?')) return;
        try {
          await api(`/api/home-recognition/${id}`, { method: 'DELETE' });
          HRMS.toast('Removed', 'success');
          await load();
        } catch (e) {
          HRMS.toast(e.message, 'error');
        }
      });
    });
  }

  function renderTable(tbody, items, api, token, load) {
    if (!items.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="stat-sub">No entries yet. Add someone using the form above.</td></tr>';
      return;
    }
    tbody.innerHTML = items
      .map(
        (item) => `<tr>
          <td>${avatarCell(item)}</td>
          <td>${esc(item.name)}</td>
          <td>${esc(item.designation)}</td>
          <td>${item.sortOrder}</td>
          <td>${item.isVisible ? 'Visible' : 'Hidden'}</td>
          <td class="table-cell-actions">
            <div class="table-actions-wrap">
              <button type="button" class="btn btn-outline btn-sm" data-edit-rec="${item.id}"
                data-name="${esc(item.name)}" data-designation="${esc(item.designation)}"
                data-sort="${item.sortOrder}">Edit</button>
              <button type="button" class="btn btn-outline btn-sm" data-photo-rec="${item.id}">Change photo</button>
              <button type="button" class="btn btn-outline btn-sm" data-toggle-rec="${item.id}" data-vis="${item.isVisible ? '1' : '0'}">${item.isVisible ? 'Hide' : 'Show'}</button>
              <button type="button" class="btn btn-outline btn-sm" data-del-rec="${item.id}">Remove</button>
            </div>
          </td>
        </tr>`
      )
      .join('');
    bindRowActions(tbody, api, token, load);
  }

  function bindAddForm(formId, category, api, token, load) {
    const form = document.getElementById(formId);
    if (!form || form.dataset.homeRecBound === '1') return;
    form.dataset.homeRecBound = '1';
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const name = form.querySelector('[data-field="name"]')?.value?.trim();
      const designation = form.querySelector('[data-field="designation"]')?.value?.trim();
      const sortOrder = form.querySelector('[data-field="sortOrder"]')?.value?.trim() || '0';
      const file = form.querySelector('[data-field="image"]')?.files?.[0];
      if (!name || !designation) {
        HRMS.toast('Name and designation are required', 'error');
        return;
      }
      const fd = new FormData();
      fd.append('category', category);
      fd.append('name', name);
      fd.append('designation', designation);
      fd.append('sortOrder', String(Number.parseInt(sortOrder, 10) || 0));
      if (file) fd.append('image', file);
      try {
        const res = await fetch('/api/home-recognition', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Could not add entry');
        HRMS.toast('Added to homepage', 'success');
        form.reset();
        await load();
      } catch (e) {
        HRMS.toast(e.message, 'error');
      }
    });
  }

  HRMS.initHomeRecognitionAdmin = function initHomeRecognitionAdmin(api) {
    const token = localStorage.getItem('token');
    const leadsBody = document.getElementById('homeRecLeadsBody');
    const employeesBody = document.getElementById('homeRecEmployeesBody');

    async function load() {
      try {
        const data = await api('/api/home-recognition/admin');
        const items = data.items || [];
        const leads = items.filter((i) => i.category === 'team_lead');
        const employees = items.filter((i) => i.category === 'employee');
        if (leadsBody) renderTable(leadsBody, leads, api, token, load);
        if (employeesBody) renderTable(employeesBody, employees, api, token, load);
      } catch (e) {
        const errRow = `<tr><td colspan="6" class="stat-sub">${esc(e.message || 'Could not load')}</td></tr>`;
        if (leadsBody) leadsBody.innerHTML = errRow;
        if (employeesBody) employeesBody.innerHTML = errRow;
      }
    }

    bindAddForm('homeRecLeadForm', 'team_lead', api, token, load);
    bindAddForm('homeRecEmployeeForm', 'employee', api, token, load);

    HRMS.refreshHomeRecognitionAdmin = load;
    return load();
  };
})();
