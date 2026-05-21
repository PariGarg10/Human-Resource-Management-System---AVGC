const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('employee') || '{}');
if (!token || user.role !== 'admin') {
  window.location.href = '/login';
}

function logout() {
  localStorage.clear();
  window.location.href = '/login';
}

document.getElementById('logoutBtn').addEventListener('click', logout);

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    logout();
    throw new Error(data.message || 'Unauthorized');
  }
  if (response.status === 403 && data.requiresPasswordChange) {
    window.location.href = '/admin/dashboard';
    throw new Error(data.message || 'Password change required');
  }
  if (response.status === 403) {
    throw new Error(data.message || 'Forbidden');
  }
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function managerOption(manager) {
  return `<option value="${manager.id}">${manager.name} (${manager.email})</option>`;
}

function employeeOption(employee) {
  const manager = employee.managername ? ` — ${employee.managername}` : ' — unassigned';
  return `<option value="${employee.employeeid}">#${employee.employeeid} · ${employee.employeename}${manager}</option>`;
}

function syncAssignmentSummary(assignments, managers) {
  const total = assignments.length;
  const assigned = assignments.filter((row) => row.managerid).length;
  const unassigned = total - assigned;
  const metrics = {
    assignmentTotalEmployees: total,
    assignmentAssignedCount: assigned,
    assignmentUnassignedCount: unassigned,
    assignmentManagerCount: managers.length,
  };
  Object.entries(metrics).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  });
}

function syncManagerSelects(managers) {
  const options = managers.length
    ? managers.map(managerOption).join('')
    : '<option value="">No managers available</option>';
  ['managerSelect', 'singleManagerSelect'].forEach((id) => {
    const select = document.getElementById(id);
    if (select) select.innerHTML = options;
  });
}

function syncEmployeeSelect(assignments) {
  const select = document.getElementById('singleEmployeeSelect');
  if (!select) return;
  select.innerHTML = assignments.length
    ? assignments.map(employeeOption).join('')
    : '<option value="">No employees found</option>';
}

function setLoading(isLoading) {
  const loading = document.getElementById('assignmentsLoading');
  const empty = document.getElementById('assignmentsEmpty');
  const wrap = document.getElementById('assignmentsTableWrap');
  if (loading) loading.classList.toggle('hidden', !isLoading);
  if (empty && isLoading) empty.classList.add('hidden');
  if (wrap && isLoading) wrap.classList.add('hidden');
}

async function loadAssignments() {
  const department = document.getElementById('departmentFilter').value.trim();
  const search = document.getElementById('searchFilter').value.trim();
  const query = new URLSearchParams();
  if (department) query.set('department', department);
  if (search) query.set('search', search);

  const url = `/api/admin/manager-assignments${query.toString() ? `?${query.toString()}` : ''}`;
  setLoading(true);
  try {
    const data = await api(url);
    const managers = data.managers || [];
    const assignments = data.assignments || [];

    syncAssignmentSummary(assignments, managers);
    syncManagerSelects(managers);
    syncEmployeeSelect(assignments);

    const tbody = document.getElementById('assignmentBody');
    const empty = document.getElementById('assignmentsEmpty');
    const wrap = document.getElementById('assignmentsTableWrap');
    const loading = document.getElementById('assignmentsLoading');

    if (loading) loading.classList.add('hidden');

    if (!assignments.length) {
      if (empty) {
        empty.classList.remove('hidden');
        empty.textContent = 'No assignments found.';
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
      <td><button type="button" class="btn btn-outline btn-sm" data-remove="${row.employeeid}">Remove</button></td>
    </tr>`
        )
        .join('');

      tbody.querySelectorAll('button[data-remove]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.getAttribute('data-remove'));
          try {
            await api(`/api/admin/manager-assignments/${id}`, { method: 'DELETE' });
            await loadAssignments();
          } catch (e) {
            HRMS.toast(e.message, 'error');
          }
        });
      });
    }
  } catch (e) {
    document.getElementById('assignmentsLoading')?.classList.add('hidden');
    HRMS.toast(e.message || 'Could not load assignments', 'error');
  } finally {
    setLoading(false);
  }
}

document.getElementById('assignForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const managerid = Number(document.getElementById('managerSelect').value);
  const employeeids = document.getElementById('employeeIdsInput').value
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const msg = document.getElementById('assignMessage');
  msg.textContent = '';
  if (!managerid) {
    msg.textContent = 'Select a manager first.';
    return;
  }
  try {
    const result = await api('/api/admin/manager-assignments/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerid, employeeids }),
    });
    msg.textContent = `Assigned: ${result.assigned}, Failed: ${result.failed}`;
    HRMS.toast('Assignments updated', 'success');
    await loadAssignments();
  } catch (error) {
    msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});

document.getElementById('singleAssignForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const managerid = Number(document.getElementById('singleManagerSelect').value);
  const employeeid = Number(document.getElementById('singleEmployeeSelect').value);
  const msg = document.getElementById('singleAssignMessage');
  msg.textContent = '';
  if (!managerid || !employeeid) {
    msg.textContent = 'Select both manager and employee.';
    return;
  }
  try {
    await api('/api/admin/manager-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerid, employeeid }),
    });
    msg.textContent = 'Employee assigned successfully.';
    HRMS.toast('Assignment added', 'success');
    await loadAssignments();
  } catch (error) {
    msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});

document.getElementById('loadAssignmentsBtn').addEventListener('click', () => loadAssignments().catch(console.error));
loadAssignments().catch(console.error);
