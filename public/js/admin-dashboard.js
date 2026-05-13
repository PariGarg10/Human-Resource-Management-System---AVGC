const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

const user = JSON.parse(localStorage.getItem('employee') || '{}');
if (user.role !== 'admin') {
  localStorage.clear();
  window.location.href = '/login';
}

document.getElementById('sidebarUserName').textContent = user.name || 'Admin';
document.getElementById('sidebarAvatar').textContent = (user.name || 'A').charAt(0).toUpperCase();
document.getElementById('navProfileEmail').textContent = user.email || '';
document.getElementById('profileName').textContent = user.name || '—';
document.getElementById('profileEmail').textContent = user.email || '—';
document.getElementById('profileDept').textContent = user.department || '—';
document.getElementById('profileCode').textContent = user.employeecode || '—';
document.getElementById('dailyDate').value = new Date().toISOString().slice(0, 10);
document.getElementById('bioTimestamp').value = new Date().toISOString();

function logout() {
  localStorage.clear();
  window.location.href = '/login';
}
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('dropdownLogout').addEventListener('click', logout);

function show(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
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

let reportsChart = null;
let analyticsChart = null;

async function loadUpcomingBirthdays() {
  const elLoading = document.getElementById('upcomingBirthdaysLoading');
  const elEmpty = document.getElementById('upcomingBirthdaysEmpty');
  const elList = document.getElementById('upcomingBirthdaysList');
  if (!elLoading || !elEmpty || !elList) return;
  elLoading.classList.remove('hidden');
  elEmpty.classList.add('hidden');
  elList.classList.add('hidden');
  elList.innerHTML = '';
  try {
    const data = await api('/api/admin/upcoming-birthdays');
    const upcoming = data.upcoming || [];
    elLoading.classList.add('hidden');
    if (!upcoming.length) {
      elEmpty.classList.remove('hidden');
      return;
    }
    elList.classList.remove('hidden');
    elList.innerHTML = upcoming
      .map(
        (r) =>
          `<li style="padding:10px 0;border-bottom:1px solid var(--border);">
            <strong>${r.name || '—'}</strong>
            <span class="stat-sub" style="display:block;margin-top:4px;">
              ${r.department || '—'} · ${r.nextBirthday}${r.daysUntil === 0 ? ' (today)' : r.daysUntil === 1 ? ' (tomorrow)' : ` (in ${r.daysUntil} days)`}
            </span>
          </li>`
      )
      .join('');
  } catch (e) {
    elLoading.textContent = e.message || 'Could not load birthdays';
  }
}

async function loadAdminStats() {
  const [empData, leaveData, hist] = await Promise.all([
    api('/api/admin/employees'),
    api('/api/admin/leaves?status=pending'),
    api('/api/admin/import-history')
  ]);
  loadUpcomingBirthdays().catch(() => {});
  const emps = empData.employees || [];
  const managers = emps.filter((e) => e.role === 'manager').length;
  const employees = emps.filter((e) => e.role === 'employee').length;
  const pending = (leaveData.leaves || []).length;

  document.getElementById('adminStatCards').innerHTML = `
    <div class="stat-card"><div class="stat-label">Total employees</div><div class="stat-value">${emps.length}</div></div>
    <div class="stat-card stat-info"><div class="stat-label">Managers</div><div class="stat-value">${managers}</div></div>
    <div class="stat-card stat-success"><div class="stat-label">Staff (role employee)</div><div class="stat-value">${employees}</div></div>
    <div class="stat-card stat-warning"><div class="stat-label">Pending leaves</div><div class="stat-value">${pending}</div></div>
  `;

  const history = hist.history || [];
  const labels = history.slice(0, 8).map((h) => `Run #${h.id}`).reverse();
  const success = history.slice(0, 8).map((h) => h.successfulrows).reverse();
  const failed = history.slice(0, 8).map((h) => h.failedrows).reverse();

  const ctx = document.getElementById('adminReportsChart');
  if (ctx && window.Chart) {
    if (reportsChart) reportsChart.destroy();
    reportsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Imported OK', data: success, borderColor: '#cc0000', tension: 0.3 },
          { label: 'Failed rows', data: failed, borderColor: '#ef4444', tension: 0.3 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const ctx2 = document.getElementById('adminAnalyticsChart');
  if (ctx2 && window.Chart && history.length) {
    if (analyticsChart) analyticsChart.destroy();
    const last = history[0];
    analyticsChart = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: ['Last import'],
        datasets: [
          { label: 'Success', data: [last.successfulrows], backgroundColor: '#10b981' },
          { label: 'Failed', data: [last.failedrows], backgroundColor: '#ef4444' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
  }
}

async function loadEmployees() {
  const data = await api('/api/admin/employees');
  document.getElementById('employeesBody').innerHTML = data.employees
    .map(
      (emp) => `
    <tr><td>${emp.id}</td><td>${emp.employeecode}</td><td>${emp.name}</td><td>${emp.email}</td><td>${emp.department || '—'}</td></tr>`
    )
    .join('');
}

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
    HRMS.toast('Employee saved', 'success');
    e.target.reset();
    await loadEmployees();
    await loadAdminStats();
  } catch (error) {
    msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});
document.getElementById('loadEmployeesBtn').addEventListener('click', () => loadEmployees().catch((e) => HRMS.toast(e.message, 'error')));

document.getElementById('newManagerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('mgrMessage');
  try {
    await api('/api/admin/managers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('mgrName').value.trim(),
        email: document.getElementById('mgrEmail').value.trim(),
        password: document.getElementById('mgrPassword').value,
        department: document.getElementById('mgrDept').value.trim()
      })
    });
    HRMS.toast('Manager created', 'success');
    e.target.reset();
    await loadEmployees();
    await loadAdminStats();
  } catch (error) {
    msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});

async function loadAdminDailyAttendance() {
  const date = document.getElementById('dailyDate').value;
  const data = await api(`/api/admin/attendance/daily?date=${date}`);
  document.getElementById('dailyBody').innerHTML = data.records
    .map(
      (row) => `
    <tr>
      <td>${row.employeecode}</td>
      <td>${row.name}</td>
      <td>${row.department || '—'}</td>
      <td>${formatDateTime(row.punchin)}</td>
      <td>${formatDateTime(row.punchout)}</td>
      <td>${row.totalhours ?? '—'}</td>
      <td>${HRMS.badge(row.status)}</td>
    </tr>`
    )
    .join('');
}
document.getElementById('loadDailyBtn').addEventListener('click', () => loadAdminDailyAttendance().catch((e) => HRMS.toast(e.message, 'error')));

document.getElementById('importForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('importMessage');
  const summaryEl = document.getElementById('importSummary');
  try {
    const file = document.getElementById('attendanceFile').files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const result = await api('/api/admin/import-attendance', { method: 'POST', body: formData });
    HRMS.toast('Import finished', 'success');
    msg.textContent = '';
    summaryEl.textContent = `Total: ${result.totalrows}, Success: ${result.successfulimports}, Failed: ${result.failedrows}`;
    await loadImportHistory();
    await loadAdminStats();
  } catch (error) {
    msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});

async function loadImportHistory() {
  const data = await api('/api/admin/import-history');
  document.getElementById('importHistoryBody').innerHTML = data.history
    .map(
      (row) => `
    <tr>
      <td>${row.id}</td>
      <td>${row.filename}</td>
      <td>${row.totalrows}</td>
      <td>${row.successfulrows}</td>
      <td>${row.failedrows}</td>
      <td>${formatDateTime(row.createdat)}</td>
    </tr>`
    )
    .join('');
}

async function loadAdminLeaves() {
  const status = document.getElementById('leaveStatusFilter').value;
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await api(`/api/admin/leaves${query}`);
  document.getElementById('adminLeavesBody').innerHTML = data.leaves
    .map(
      (leave) => `
    <tr>
      <td>${leave.id}</td>
      <td>${leave.name} (${leave.employeecode})</td>
      <td>${leave.leavetype}</td>
      <td>${leave.fromdate}</td>
      <td>${leave.todate}</td>
      <td>${HRMS.badge(leave.status)}</td>
      <td>${leave.status === 'pending' ? `<button type="button" class="btn btn-primary btn-sm" onclick="window.processLeave(${leave.id},'approve')">Approve</button> <button type="button" class="btn btn-outline btn-sm" onclick="window.processLeave(${leave.id},'reject')">Reject</button>` : '—'}</td>
    </tr>`
    )
    .join('');
}

window.processLeave = async (id, action) => {
  try {
    await api(`/api/admin/leaves/${id}/${action}`, { method: 'PUT' });
    HRMS.toast(action === 'approve' ? 'Leave approved' : 'Leave rejected', 'success');
    await loadAdminLeaves();
    await loadAdminStats();
  } catch (error) {
    HRMS.toast(error.message, 'error');
  }
};
document.getElementById('loadAdminLeavesBtn').addEventListener('click', () => loadAdminLeaves().catch((e) => HRMS.toast(e.message, 'error')));

document.getElementById('biometricForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const payload = {
      employeecode: document.getElementById('bioEmpCode').value.trim(),
      type: document.getElementById('bioType').value,
      timestamp: document.getElementById('bioTimestamp').value.trim(),
      deviceid: document.getElementById('bioDeviceId').value.trim(),
      api_key: document.getElementById('bioApiKey').value.trim()
    };
    await api('/api/biometric/punch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': payload.api_key },
      body: JSON.stringify(payload)
    }, false);
    HRMS.toast('Punch recorded', 'success');
  } catch (error) {
    document.getElementById('biometricMessage').textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});

document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: document.getElementById('currentPassword').value,
        newPassword: document.getElementById('newPassword').value
      })
    });
    HRMS.toast('Password updated', 'success');
    setTimeout(logout, 900);
  } catch (error) {
    document.getElementById('passwordChangeMessage').textContent = error.message;
  }
});

function setupDropzone(zoneId, inputId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-dragover');
    if (e.dataTransfer.files.length) input.files = e.dataTransfer.files;
  });
}
setupDropzone('employeeDropzone', 'employeeImportFile');
setupDropzone('attendanceDropzone', 'attendanceFile');

document.getElementById('employeeImportBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('employeeImportFile');
  const msg = document.getElementById('employeeImportMessage');
  if (!fileInput.files.length) {
    HRMS.toast('Choose a file first', 'error');
    return;
  }
  try {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    const result = await api('/api/admin/import-employees', { method: 'POST', body: formData });
    HRMS.toast(`Imported ${result.successfulimports} rows`, 'success');
    msg.textContent = `Success: ${result.successfulimports}, Failed: ${result.failedrows}`;
    await loadEmployees();
    await loadAdminStats();
  } catch (error) {
    msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});

HRMS.initSidebar();
HRMS.initNavbarClock('navbarClock');
HRMS.initProfileDropdown();
HRMS.initNavbarSearch(['employeesBody', 'dailyBody', 'importHistoryBody', 'adminLeavesBody']);

if (user.mustchangepassword) show('passwordChangeSection');

Promise.all([
  loadAdminStats(),
  loadEmployees(),
  loadAdminDailyAttendance(),
  loadImportHistory(),
  loadAdminLeaves()
]).catch(console.error);
