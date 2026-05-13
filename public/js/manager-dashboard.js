const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('employee') || '{}');
if (!token || user.role !== 'manager') {
  window.location.href = '/login';
}

document.getElementById('sidebarUserName').textContent = user.name || 'Manager';
document.getElementById('sidebarAvatar').textContent = (user.name || 'M').charAt(0).toUpperCase();
document.getElementById('navProfileEmail').textContent = user.email || '';
document.getElementById('profileName').textContent = user.name || '—';
document.getElementById('profileEmail').textContent = user.email || '—';
document.getElementById('profileDept').textContent = user.department || '—';
document.getElementById('profileCode').textContent = user.employeecode || '—';

document.getElementById('managerDate').value = new Date().toISOString().slice(0, 10);
const n = new Date();
document.getElementById('tmMonth').value = n.getMonth() + 1;
document.getElementById('tmYear').value = n.getFullYear();

function logout() {
  localStorage.clear();
  window.location.href = '/login';
}
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('dropdownLogout').addEventListener('click', logout);

async function api(path, opt = {}) {
  const response = await fetch(path, {
    ...opt,
    headers: { ...opt.headers, Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 403) {
    logout();
    throw new Error(data.message || 'Unauthorized');
  }
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

let doughnutChart = null;
let barChart = null;

async function loadSummary() {
  const date = document.getElementById('managerDate').value;
  const data = await api(`/api/manager/dashboard-summary?date=${date}`);
  document.getElementById('summaryCards').innerHTML = `
    <div class="stat-card"><div class="stat-label">Team size</div><div class="stat-value">${data.totalemployees}</div></div>
    <div class="stat-card stat-warning"><div class="stat-label">Pending leaves</div><div class="stat-value">${data.pendingleaves}</div></div>
    <div class="stat-card stat-success"><div class="stat-label">Present</div><div class="stat-value">${data.todaysummary.present}</div></div>
    <div class="stat-card"><div class="stat-label">Half day</div><div class="stat-value">${data.todaysummary.halfday}</div></div>
    <div class="stat-card"><div class="stat-label">Leave</div><div class="stat-value">${data.todaysummary.leave}</div></div>
    <div class="stat-card stat-danger"><div class="stat-label">Absent</div><div class="stat-value">${data.todaysummary.absent}</div></div>
  `;

  document.getElementById('reportsCards').innerHTML = document.getElementById('summaryCards').innerHTML;

  const ctx = document.getElementById('managerDoughnut');
  if (ctx && window.Chart) {
    if (doughnutChart) doughnutChart.destroy();
    doughnutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Present', 'Half day', 'Leave', 'Absent'],
        datasets: [
          {
            data: [
              data.todaysummary.present,
              data.todaysummary.halfday,
              data.todaysummary.leave,
              data.todaysummary.absent
            ],
            backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#ef4444']
          }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }
}

async function loadDailyAttendance() {
  const date = document.getElementById('managerDate').value;
  const data = await api(`/api/manager/attendance/daily?date=${date}`);
  document.getElementById('dailyBody').innerHTML = data.records
    .map(
      (row) => `
    <tr>
      <td>${row.employeecode}</td>
      <td>${row.name}</td>
      <td>${row.department || '—'}</td>
      <td>${HRMS.formatDateTime(row.punchin)}</td>
      <td>${HRMS.formatDateTime(row.punchout)}</td>
      <td>${row.totalhours ?? '—'}</td>
      <td>${HRMS.badge(row.status)}</td>
    </tr>`
    )
    .join('');
}

async function loadLeaves() {
  const data = await api('/api/leaves/team');
  document.getElementById('leaveBody').innerHTML = data.leaves
    .map(
      (leave) => `
    <tr>
      <td>${leave.name} (${leave.employeecode})</td>
      <td>${leave.leavetype}</td>
      <td>${leave.fromdate}</td>
      <td>${leave.todate}</td>
      <td>${HRMS.badge(leave.status)}</td>
    </tr>`
    )
    .join('');
}

async function loadEmployees() {
  const data = await api('/api/manager/employees');
  document.getElementById('employeesBody').innerHTML = data.employees
    .map(
      (e) => `
    <tr><td>${e.employeecode}</td><td>${e.name}</td><td>${e.email}</td><td>${e.department || '—'}</td></tr>`
    )
    .join('');
}

async function loadTeamSummary() {
  const month = document.getElementById('tmMonth').value;
  const year = document.getElementById('tmYear').value;
  const data = await api(`/api/manager/team-summary?month=${month}&year=${year}`);
  const rows = data.rows || [];
  document.getElementById('teamSummaryBody').innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td>${r.name}</td>
      <td>${r.presentdays ?? 0}</td>
      <td>${r.halfdays ?? 0}</td>
      <td>${r.leavedays ?? 0}</td>
      <td>${r.absentdays ?? 0}</td>
    </tr>`
    )
    .join('');
    const res = await fetch('/api/users/profile', {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
  
    // ✅ This one line updates navbar + sidebar + profile icon everywhere
  if (data.avatar_url) {
    HRMS.updateAvatarEverywhere(data.avatar_url);
  }

  const ctx = document.getElementById('managerBarChart');
  if (ctx && window.Chart && rows.length) {
    if (barChart) barChart.destroy();
    const top = rows.slice(0, 8);
    barChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top.map((r) => r.name.split(' ')[0]),
        datasets: [
          { label: 'Present', data: top.map((r) => r.presentdays || 0), backgroundColor: '#10b981' },
          { label: 'Absent', data: top.map((r) => r.absentdays || 0), backgroundColor: '#ef4444' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { stacked: false }, y: { beginAtZero: true } }
      }
    });
  }
}

document.getElementById('loadDailyBtn').addEventListener('click', () => {
  Promise.all([loadSummary(), loadDailyAttendance(), loadLeaves()]).catch((e) => HRMS.toast(e.message, 'error'));
});

document.getElementById('loadTeamSummaryBtn').addEventListener('click', () => {
  loadTeamSummary().catch((e) => HRMS.toast(e.message, 'error'));
});

HRMS.initSidebar();
HRMS.initNavbarClock('navbarClock');
HRMS.initProfileDropdown();

Promise.all([loadSummary(), loadDailyAttendance(), loadLeaves(), loadEmployees(), loadTeamSummary()]).catch(console.error);
