const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

const employee = JSON.parse(localStorage.getItem('employee') || '{}');
const role = employee.role || 'employee';
const employeeName = document.getElementById('employeeName');
employeeName.textContent = employee.name ? `${employee.name} (${employee.email || ''})` : '';

const roleBadge = document.getElementById('roleBadge');
roleBadge.className = `badge ${role}`;
roleBadge.textContent = role;

const now = new Date();
const monthEl = document.getElementById('month');
const yearEl = document.getElementById('year');
monthEl.value = now.getMonth() + 1;
yearEl.value = now.getFullYear();
document.getElementById('dailyDate').value = now.toISOString().slice(0, 10);
document.getElementById('managerDate').value = now.toISOString().slice(0, 10);
document.getElementById('bioTimestamp').value = new Date().toISOString();

function logout() {
  localStorage.clear();
  window.location.href = '/login';
}
document.getElementById('logoutBtn').addEventListener('click', logout);

function show(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

function hide(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function configureRoleSections() {
  show('leaveSection');
  if (role === 'admin') {
    show('adminEmployeesSection');
    show('adminDailySection');
    show('importSection');
    show('adminLeavesSection');
    hide('leaveSection');
  }
  if (role === 'manager') {
    show('managerSection');
    show('managerLeavesSection');
    hide('leaveSection');
    hide('biometricSection');
  }
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function badge(status) {
  const normalized = status || 'absent';
  return `<span class="badge ${normalized}">${normalized}</span>`;
}

async function api(path, options = {}, withAuth = true) {
  const headers = { ...(options.headers || {}) };
  if (withAuth) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    logout();
    throw new Error('Unauthorized');
  }
  if (response.status === 403 && data.requiresPasswordChange) {
    show('passwordChangeSection');
    throw new Error(data.message || 'Password change required');
  }
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

async function loadToday() {
  const data = await api('/api/attendance/today');
  const record = data.record || {};
  document.getElementById('todayCard').innerHTML = `
    <div class="tile"><strong>Check in</strong><br>${record.punchin ? formatDateTime(record.punchin) : '—'}</div>
    <div class="tile"><strong>Check out</strong><br>${record.punchout ? formatDateTime(record.punchout) : '—'}</div>
    <div class="tile"><strong>Total Hours</strong><br>${record.totalhours ?? '-'}</div>
    <div class="tile"><strong>Status</strong><br>${badge(record.status)}</div>
  `;
}

async function loadAttendanceViews() {
  const month = Number(monthEl.value);
  const year = Number(yearEl.value);
  const [historyData, summaryData] = await Promise.all([
    api(`/api/attendance/history?month=${month}&year=${year}`),
    api(`/api/attendance/summary?month=${month}&year=${year}`)
  ]);

  const records = historyData.records || [];
  document.getElementById('historyBody').innerHTML = records.map((record) => `
    <tr>
      <td>${record.date}</td>
      <td>${formatDateTime(record.punchin)}</td>
      <td>${formatDateTime(record.punchout)}</td>
      <td>${record.totalhours ?? '-'}</td>
      <td>${badge(record.status)}</td>
    </tr>
  `).join('');

  document.getElementById('summary').textContent =
    `Present: ${summaryData.present} | Half Days: ${summaryData.halfday} | Leave: ${summaryData.leave || 0} | Absent: ${summaryData.absent}`;

  const statusByDate = new Map(records.map((r) => [r.date, r.status || 'absent']));
  const daysInMonth = new Date(year, month, 0).getDate();
  const calendarEl = document.getElementById('calendar');
  calendarEl.innerHTML = '';
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const status = statusByDate.get(date) || 'absent';
    const dayEl = document.createElement('div');
    dayEl.className = `day ${status}`;
    dayEl.innerHTML = `<div>${day}</div><small>${status}</small>`;
    calendarEl.appendChild(dayEl);
  }
}

document.getElementById('loadAttendanceBtn').addEventListener('click', () => loadAttendanceViews().catch(alert));

document.getElementById('biometricForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageEl = document.getElementById('biometricMessage');
  try {
    const payload = {
      employeecode: document.getElementById('bioEmpCode').value.trim(),
      type: document.getElementById('bioType').value,
      timestamp: document.getElementById('bioTimestamp').value.trim(),
      deviceid: document.getElementById('bioDeviceId').value.trim(),
      api_key: document.getElementById('bioApiKey').value.trim()
    };
    const data = await api('/api/biometric/punch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': payload.api_key },
      body: JSON.stringify(payload)
    }, false);
    messageEl.textContent = data.message || 'Punch processed';
    await loadToday();
    await loadAttendanceViews();
  } catch (error) {
    messageEl.textContent = error.message;
  }
});

document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageEl = document.getElementById('passwordChangeMessage');
  try {
    await api('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: document.getElementById('currentPassword').value,
        newPassword: document.getElementById('newPassword').value
      })
    });
    messageEl.textContent = 'Password updated. Please login again.';
    setTimeout(logout, 900);
  } catch (error) {
    messageEl.textContent = error.message;
  }
});

document.getElementById('leaveForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageEl = document.getElementById('leaveMessage');
  try {
    await api('/api/leaves/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leavetype: document.getElementById('leaveType').value,
        fromdate: document.getElementById('leaveFrom').value,
        todate: document.getElementById('leaveTo').value,
        reason: document.getElementById('leaveReason').value
      })
    });
    messageEl.textContent = 'Leave request submitted';
    await loadMyLeaves();
  } catch (error) {
    messageEl.textContent = error.message;
  }
});

async function loadMyLeaves() {
  if (role !== 'employee') return;
  const data = await api('/api/leaves/my-leaves');
  document.getElementById('myLeavesBody').innerHTML = data.leaves.map((leave) => `
    <tr>
      <td>${leave.leavetype}</td>
      <td>${leave.fromdate}</td>
      <td>${leave.todate}</td>
      <td>${badge(leave.status)}</td>
      <td>${leave.reason || '-'}</td>
    </tr>
  `).join('');
}

async function loadEmployees() {
  if (role !== 'admin') return;
  const data = await api('/api/admin/employees');
  document.getElementById('employeesBody').innerHTML = data.employees.map((emp) => `
    <tr>
      <td>${emp.id}</td>
      <td>${emp.employeecode}</td>
      <td>${emp.name}</td>
      <td>${emp.email}</td>
      <td>${emp.department || '-'}</td>
    </tr>
  `).join('');
}
document.getElementById('loadEmployeesBtn').addEventListener('click', () => loadEmployees().catch((e) => alert(e.message)));

document.getElementById('addEmployeeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('adminMessage');
  try {
    await api('/api/admin/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('newEmpName').value.trim(),
        email: document.getElementById('newEmpEmail').value.trim(),
        password: document.getElementById('newEmpPassword').value.trim(),
        department: document.getElementById('newEmpDept').value.trim(),
        role: document.getElementById('newEmpRole').value
      })
    });
    msg.textContent = 'Employee saved';
    e.target.reset();
    await loadEmployees();
  } catch (error) {
    msg.textContent = error.message;
  }
});

async function loadAdminDailyAttendance() {
  if (role !== 'admin') return;
  const date = document.getElementById('dailyDate').value;
  const data = await api(`/api/admin/attendance/daily?date=${date}`);
  document.getElementById('dailyBody').innerHTML = data.records.map((row) => `
    <tr>
      <td>${row.employeecode}</td>
      <td>${row.name}</td>
      <td>${row.department || '-'}</td>
      <td>${formatDateTime(row.punchin)}</td>
      <td>${formatDateTime(row.punchout)}</td>
      <td>${row.totalhours ?? '-'}</td>
      <td>${badge(row.status)}</td>
    </tr>
  `).join('');
}
document.getElementById('loadDailyBtn').addEventListener('click', () => loadAdminDailyAttendance().catch((e) => alert(e.message)));

document.getElementById('importForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('importMessage');
  const summaryEl = document.getElementById('importSummary');
  try {
    const file = document.getElementById('attendanceFile').files[0];
    const formData = new FormData();
    formData.append('file', file);
    const result = await api('/api/admin/import-attendance', {
      method: 'POST',
      body: formData
    });
    msg.textContent = 'Import completed';
    summaryEl.textContent = `Total: ${result.totalrows}, Imported: ${result.successfulimports}, Skipped: ${result.skipped || 0}, Failed: ${result.failedrows}`;
    await Promise.all([loadImportHistory(), loadAttendanceViews(), loadToday()]);
  } catch (error) {
    msg.textContent = error.message;
  }
});

async function loadImportHistory() {
  if (role !== 'admin') return;
  const data = await api('/api/admin/import-history');
  document.getElementById('importHistoryBody').innerHTML = data.history.map((row) => `
    <tr>
      <td>${row.id}</td>
      <td>${row.filename}</td>
      <td>${row.totalrows}</td>
      <td>${row.successfulrows}</td>
      <td>${row.failedrows}</td>
      <td>${formatDateTime(row.createdat)}</td>
    </tr>
  `).join('');
}

async function loadAdminLeaves() {
  if (role !== 'admin') return;
  const status = document.getElementById('leaveStatusFilter').value;
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await api(`/api/admin/leaves${query}`);
  document.getElementById('adminLeavesBody').innerHTML = data.leaves.map((leave) => `
    <tr>
      <td>${leave.id}</td>
      <td>${leave.name} (${leave.employeecode})</td>
      <td>${leave.leavetype}</td>
      <td>${leave.fromdate}</td>
      <td>${leave.todate}</td>
      <td>${badge(leave.status)}</td>
      <td>${leave.status === 'pending' ? `<button onclick="processLeave(${leave.id}, 'approve')">Approve</button><button onclick="processLeave(${leave.id}, 'reject')" class="outline">Reject</button>` : '-'}</td>
    </tr>
  `).join('');
}

window.processLeave = async (id, action) => {
  try {
    await api(`/api/admin/leaves/${id}/${action}`, { method: 'PUT' });
    await Promise.all([loadAdminLeaves(), loadAttendanceViews(), loadToday()]);
  } catch (error) {
    alert(error.message);
  }
};
document.getElementById('loadAdminLeavesBtn').addEventListener('click', () => loadAdminLeaves().catch((e) => alert(e.message)));

async function loadManagerDaily() {
  if (role !== 'manager') return;
  const date = document.getElementById('managerDate').value;
  const data = await api(`/api/manager/attendance/daily?date=${date}`);
  document.getElementById('managerDailyBody').innerHTML = data.records.map((row) => `
    <tr>
      <td>${row.employeecode}</td>
      <td>${row.name}</td>
      <td>${row.department || '-'}</td>
      <td>${formatDateTime(row.punchin)}</td>
      <td>${formatDateTime(row.punchout)}</td>
      <td>${row.totalhours ?? '-'}</td>
      <td>${badge(row.status)}</td>
    </tr>
  `).join('');
}
document.getElementById('loadManagerDailyBtn').addEventListener('click', () => loadManagerDaily().catch((e) => alert(e.message)));

async function loadManagerLeaves() {
  if (role !== 'manager') return;
  const data = await api('/api/leaves/team');
  document.getElementById('managerLeavesBody').innerHTML = data.leaves.map((leave) => `
    <tr>
      <td>${leave.name} (${leave.employeecode})</td>
      <td>${leave.leavetype}</td>
      <td>${leave.fromdate}</td>
      <td>${leave.todate}</td>
      <td>${badge(leave.status)}</td>
    </tr>
  `).join('');
}

configureRoleSections();
Promise.all([
  loadToday(),
  loadAttendanceViews(),
  loadMyLeaves(),
  loadEmployees(),
  loadAdminDailyAttendance(),
  loadImportHistory(),
  loadAdminLeaves(),
  loadManagerDaily(),
  loadManagerLeaves()
]).catch((error) => console.error(error));
