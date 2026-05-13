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
  if (response.status === 401 || response.status === 403) {
    logout();
    throw new Error(data.message || 'Unauthorized');
  }
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function managerOption(manager) {
  return `<option value="${manager.id}">${manager.name} (${manager.email})</option>`;
}

async function loadAssignments() {
  const department = document.getElementById('departmentFilter').value.trim();
  const search = document.getElementById('searchFilter').value.trim();
  const query = new URLSearchParams();
  if (department) query.set('department', department);
  if (search) query.set('search', search);

  const url = `/api/admin/manager-assignments${query.toString() ? `?${query.toString()}` : ''}`;
  const data = await api(url);

  document.getElementById('managerSelect').innerHTML = data.managers.map(managerOption).join('');
  document.getElementById('assignmentBody').innerHTML = data.assignments.map((row) => `
    <tr>
      <td>${row.employeeid}</td>
      <td>${row.employeename}</td>
      <td>${row.employeeemail}</td>
      <td>${row.department || '-'}</td>
      <td>${row.managername ? `${row.managername} (${row.manageremail})` : '-'}</td>
      <td><button onclick="removeAssignment(${row.employeeid})" class="outline">Remove</button></td>
    </tr>
  `).join('');
}

window.removeAssignment = async (employeeid) => {
  await api(`/api/admin/manager-assignments/${employeeid}`, { method: 'DELETE' });
  await loadAssignments();
};

document.getElementById('assignForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const managerid = Number(document.getElementById('managerSelect').value);
  const employeeids = document.getElementById('employeeIdsInput').value
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const msg = document.getElementById('assignMessage');
  msg.textContent = '';
  try {
    const result = await api('/api/admin/manager-assignments/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerid, employeeids })
    });
    msg.textContent = `Assigned: ${result.assigned}, Failed: ${result.failed}`;
    await loadAssignments();
  } catch (error) {
    msg.textContent = error.message;
  }
});

document.getElementById('loadAssignmentsBtn').addEventListener('click', () => loadAssignments().catch(console.error));
loadAssignments().catch(console.error);
