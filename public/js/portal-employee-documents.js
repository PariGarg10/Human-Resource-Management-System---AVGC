/**
 * Employee documents — admin view/upload (pay slip, Form 16, appraisal) + profile docs.
 */
(function () {
  window.HRMS = window.HRMS || {};

  const ADMIN_CATEGORIES = [
    { value: 'payslip', label: 'Pay slip' },
    { value: 'form_16', label: 'Form 16' },
    { value: 'appraisal_letter', label: 'Appraisal letter' },
  ];

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(value) {
    if (!value) return '—';
    if (HRMS.formatDisplayDate) return HRMS.formatDisplayDate(value);
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  async function openDoc(id) {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/employee-documents/${id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'Could not open document');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  HRMS.initEmployeeDocumentsAdmin = function initEmployeeDocumentsAdmin(api) {
    const empSelect = document.getElementById('empDocEmployeeSelect');
    const empBody = document.getElementById('empDocEmployeeListBody');
    const detailTitle = document.getElementById('empDocDetailTitle');
    const detailBody = document.getElementById('empDocDetailBody');
    const uploadForm = document.getElementById('empDocAdminUploadForm');
    const uploadCategory = document.getElementById('empDocAdminCategory');
    const uploadFile = document.getElementById('empDocAdminFile');
    let employees = [];
    let selectedId = null;

    if (uploadCategory) {
      uploadCategory.innerHTML = ADMIN_CATEGORIES.map(
        (c) => `<option value="${c.value}">${esc(c.label)}</option>`
      ).join('');
    }

    async function loadOverview() {
      if (!empBody) return;
      empBody.innerHTML = '<tr><td colspan="5" class="stat-sub">Loading…</td></tr>';
      try {
        const data = await api('/api/employee-documents/admin/overview');
        employees = data.employees || [];
        if (!employees.length) {
          empBody.innerHTML = '<tr><td colspan="5" class="stat-sub">No employees found.</td></tr>';
          return;
        }
        empBody.innerHTML = employees
          .map(
            (e) => `<tr data-emp-doc-row="${e.id}" style="cursor:pointer;">
              <td>${esc(e.employeecode)}</td>
              <td>${esc(e.name)}</td>
              <td>${esc(e.department || '—')}</td>
              <td>${esc(e.designation || '—')}</td>
              <td>${e.document_count || 0}</td>
            </tr>`
          )
          .join('');

        empBody.querySelectorAll('[data-emp-doc-row]').forEach((row) => {
          row.addEventListener('click', () => {
            const id = Number(row.getAttribute('data-emp-doc-row'));
            selectEmployee(id).catch((err) => HRMS.toast(err.message, 'error'));
          });
        });

        if (empSelect) {
          empSelect.innerHTML =
            '<option value="">Select employee…</option>' +
            employees
              .map((e) => `<option value="${e.id}">${esc(e.name)} (${esc(e.employeecode)})</option>`)
              .join('');
        }
      } catch (e) {
        empBody.innerHTML = `<tr><td colspan="5" class="stat-sub">${esc(e.message)}</td></tr>`;
      }
    }

    async function selectEmployee(id) {
      selectedId = id;
      const emp = employees.find((e) => e.id === id);
      if (detailTitle) {
        detailTitle.textContent = emp ? `${emp.name} — documents` : 'Employee documents';
      }
      if (empSelect) empSelect.value = String(id);
      await loadEmployeeDocs(id);
    }

    async function loadEmployeeDocs(id) {
      if (!detailBody) return;
      detailBody.innerHTML = '<tr><td colspan="5" class="stat-sub">Loading…</td></tr>';
      try {
        const data = await api(`/api/employee-documents/admin/employee/${id}`);
        const docs = data.documents || [];
        if (!docs.length) {
          detailBody.innerHTML =
            '<tr><td colspan="5" class="stat-sub">No documents for this employee yet.</td></tr>';
          return;
        }
        detailBody.innerHTML = docs
          .map(
            (d) => `<tr>
              <td>${esc(d.originalName)}</td>
              <td>${esc(d.categoryLabel || d.category)}</td>
              <td>${esc(d.source === 'admin' ? 'Admin' : 'Employee')}</td>
              <td>${fmtDate(d.createdAt)}</td>
              <td><button type="button" class="btn btn-outline btn-sm" data-emp-doc-view="${d.id}">View</button></td>
            </tr>`
          )
          .join('');

        detailBody.querySelectorAll('[data-emp-doc-view]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const docId = Number(btn.getAttribute('data-emp-doc-view'));
            openDoc(docId).catch((err) => HRMS.toast(err.message, 'error'));
          });
        });
      } catch (e) {
        detailBody.innerHTML = `<tr><td colspan="5" class="stat-sub">${esc(e.message)}</td></tr>`;
      }
    }

    if (empSelect) {
      empSelect.addEventListener('change', () => {
        const id = Number(empSelect.value);
        if (!Number.isFinite(id)) return;
        selectEmployee(id).catch((err) => HRMS.toast(err.message, 'error'));
      });
    }

    if (uploadForm) {
      uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = Number(empSelect?.value || selectedId);
        if (!Number.isFinite(id)) {
          HRMS.toast('Select an employee first', 'error');
          return;
        }
        const file = uploadFile?.files?.[0];
        if (!file) {
          HRMS.toast('Choose a file to upload', 'error');
          return;
        }
        const fd = new FormData();
        fd.append('employeeId', String(id));
        fd.append('category', uploadCategory?.value || 'payslip');
        fd.append('file', file);
        try {
          const token = localStorage.getItem('token');
          const res = await fetch('/api/employee-documents/admin/upload', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: fd,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || 'Upload failed');
          HRMS.toast('Document uploaded', 'success');
          if (uploadFile) uploadFile.value = '';
          await loadOverview();
          await loadEmployeeDocs(id);
        } catch (err) {
          HRMS.toast(err.message || 'Upload failed', 'error');
        }
      });
    }

    return loadOverview();
  };
})();
