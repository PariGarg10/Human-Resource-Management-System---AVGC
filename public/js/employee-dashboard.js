const token = localStorage.getItem('token');
if (!token) {
  window.location.replace('/');
  throw new Error('Not signed in');
}

let user = {};
try {
  user = JSON.parse(localStorage.getItem('employee') || '{}');
} catch (_e) {
  localStorage.removeItem('employee');
  localStorage.removeItem('token');
  window.location.replace('/');
  throw new Error('Invalid session data');
}

const userRole = String(user.role || 'employee').toLowerCase().trim();
if (userRole !== 'employee') {
  localStorage.clear();
  window.location.replace('/');
  throw new Error('Wrong role');
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

const initial = user.name || user.email || 'E';
setText('sidebarUserName', user.name || 'Employee');
setText('sidebarAvatar', initial.charAt(0).toUpperCase());
setText('navProfileInitial', initial.charAt(0).toUpperCase());
setText('navProfileEmail', user.email || '');
setText('profileName', user.name || '—');
setText('profileEmail', user.email || '');
setText('profileDept', user.department || '—');

const now = new Date();
const monthEl = document.getElementById('month');
const yearEl = document.getElementById('year');
const monthCal = document.getElementById('monthCal');
const yearCal = document.getElementById('yearCal');

function getSelectedMonthYear() {
  const d = new Date();
  const rawM = monthEl ? Number(monthEl.value) : d.getMonth() + 1;
  const rawY = yearEl ? Number(yearEl.value) : d.getFullYear();
  const month = Number.isFinite(rawM) && rawM >= 1 && rawM <= 12 ? rawM : d.getMonth() + 1;
  const year = Number.isFinite(rawY) ? rawY : d.getFullYear();
  return { month, year };
}

function syncMonthYear() {
  if (!monthEl || !yearEl || !monthCal || !yearCal) return;
  monthCal.value = monthEl.value;
  yearCal.value = yearEl.value;
}

function initMonthYearPickers() {
  const d = new Date();
  if (monthEl) monthEl.value = d.getMonth() + 1;
  if (yearEl) yearEl.value = d.getFullYear();
  if (monthCal && monthEl) monthCal.value = monthEl.value;
  if (yearCal && yearEl) yearCal.value = yearEl.value;
}

initMonthYearPickers();

function logout() {
  localStorage.clear();
  window.location.href = '/login';
}

document.getElementById('logoutBtn')?.addEventListener('click', logout);
document.getElementById('dropdownLogout')?.addEventListener('click', logout);

function show(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

async function api(path, options = {}, withAuth = true) {
  const headers = { ...(options.headers || {}) };
  if (withAuth) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch (netErr) {
    throw new Error(
      'Cannot reach the server. Use the same URL you signed in with (e.g. http://localhost:5050) and ensure npm start is running.'
    );
  }
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    logout();
    throw new Error('Unauthorized');
  }
  if (response.status === 403 && data.requiresPasswordChange) {
    show('passwordChangeSection');
    const err = new Error(data.message || 'Password change required');
    err.requiresPasswordChange = true;
    throw err;
  }
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

let summaryChartInstance = null;

async function loadDashboardStats() {
  const { month, year } = getSelectedMonthYear();
  const [todayData, summaryData] = await Promise.all([
    api('/api/attendance/today'),
    api(`/api/attendance/summary?month=${month}&year=${year}`)
  ]);

  const record = todayData.record || {};
  const status = record.status || 'absent';

  const statEl = document.getElementById('employeeStatCards');
  if (!statEl) return;

  statEl.innerHTML = `
    <div class="stat-card stat-info">
      <div class="stat-label">Today's status</div>
      <div class="stat-value" style="font-size: 22px;">${HRMS.badge(status)}</div>
      <div class="stat-sub">${record.punchin ? 'Checked in' : 'No punch yet'}</div>
    </div>
    <div class="stat-card stat-success">
      <div class="stat-label">Present days</div>
      <div class="stat-value">${summaryData.present}</div>
      <div class="stat-sub">This month</div>
    </div>
    <div class="stat-card stat-warning">
      <div class="stat-label">Half days</div>
      <div class="stat-value">${summaryData.halfday}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Leave days</div>
      <div class="stat-value">${summaryData.leave || 0}</div>
    </div>
    <div class="stat-card stat-danger">
      <div class="stat-label">Absent days</div>
      <div class="stat-value">${summaryData.absent}</div>
    </div>
  `;

  const ctx = document.getElementById('employeeSummaryChart');
  if (ctx && window.Chart) {
    if (summaryChartInstance) summaryChartInstance.destroy();
    summaryChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Present', 'Half day', 'Leave', 'Absent'],
        datasets: [
          {
            data: [
              summaryData.present,
              summaryData.halfday,
              summaryData.leave || 0,
              summaryData.absent
            ],
            backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#ef4444'],
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: getComputedStyle(document.body).color } }
        }
      }
    });
  }
}

async function loadTodaySection() {
  const data = await api('/api/attendance/today');
  const record = data.record || {};
  const card = document.getElementById('todayCard');
  if (!card) return;
  card.innerHTML = `
    <div class="stat-card stat-success"><div class="stat-label">Punch in</div><div class="stat-value" style="font-size:16px;">${record.punchin ? HRMS.formatDateTime(record.punchin) : '—'}</div></div>
    <div class="stat-card stat-warning"><div class="stat-label">Punch out</div><div class="stat-value" style="font-size:16px;">${record.punchout ? HRMS.formatDateTime(record.punchout) : '—'}</div></div>
    <div class="stat-card"><div class="stat-label">Total hours</div><div class="stat-value">${record.totalhours ?? '—'}</div></div>
    <div class="stat-card stat-info"><div class="stat-label">Status</div><div class="stat-value" style="font-size:18px;">${HRMS.badge(record.status)}</div></div>
  `;
}

async function loadAttendanceViews() {
  const { month, year } = getSelectedMonthYear();
  const [historyData, summaryData] = await Promise.all([
    api(`/api/attendance/history?month=${month}&year=${year}`),
    api(`/api/attendance/summary?month=${month}&year=${year}`)
  ]);

  const records = historyData.records || [];
  const histBody = document.getElementById('historyBody');
  if (histBody) {
    histBody.innerHTML = records
    .map(
      (record) => `
    <tr>
      <td>${record.date}</td>
      <td>${HRMS.formatDateTime(record.punchin)}</td>
      <td>${HRMS.formatDateTime(record.punchout)}</td>
      <td>${record.totalhours ?? '—'}</td>
      <td>${HRMS.badge(record.status)}</td>
    </tr>`
    )
    .join('');
  }

  const summaryEl = document.getElementById('summary');
  if (summaryEl) {
    summaryEl.textContent = `Present: ${summaryData.present} · Half: ${summaryData.halfday} · Leave: ${summaryData.leave || 0} · Absent: ${summaryData.absent}`;
  }

  HRMS.initTableSearch('historyTable', 'historySearch');
}

function buildCalendar(year, month, records) {
  const statusByDate = new Map(records.map((r) => [r.date, r.status || 'absent']));
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startPad = first.getDay();
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;
  calendarEl.innerHTML = '';

  for (let i = 0; i < startPad; i += 1) {
    const empty = document.createElement('div');
    empty.className = 'cal-day';
    empty.style.visibility = 'hidden';
    calendarEl.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const status = statusByDate.get(dateStr) || 'absent';
    const dow = new Date(year, month - 1, day).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const dayEl = document.createElement('div');
    dayEl.className = `cal-day ${status}${isWeekend ? ' weekend' : ''}`;
    dayEl.title = `${dateStr}: ${status}`;
    dayEl.innerHTML = `<div class="day-num">${day}</div><div class="day-status">${status}</div>`;
    calendarEl.appendChild(dayEl);
  }
}

async function loadCalendarView() {
  const fallback = getSelectedMonthYear();
  const monthRaw = monthCal ? Number(monthCal.value) : fallback.month;
  const yearRaw = yearCal ? Number(yearCal.value) : fallback.year;
  const month = Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : fallback.month;
  const year = Number.isFinite(yearRaw) ? yearRaw : fallback.year;
  const historyData = await api(`/api/attendance/history?month=${month}&year=${year}`);
  buildCalendar(year, month, historyData.records || []);
}

document.getElementById('loadAttendanceBtn')?.addEventListener('click', () => {
  syncMonthYear();
  Promise.all([loadAttendanceViews(), loadDashboardStats(), loadTodaySection(), loadCalendarView()]).catch((e) => {
    HRMS.toast(e.message, 'error');
  });
});

document.getElementById('loadCalendarBtn')?.addEventListener('click', () => {
  if (monthEl && monthCal) monthEl.value = monthCal.value;
  if (yearEl && yearCal) yearEl.value = yearCal.value;
  loadCalendarView().catch((e) => HRMS.toast(e.message, 'error'));
});

if (monthEl) monthEl.addEventListener('change', syncMonthYear);
if (yearEl) yearEl.addEventListener('change', syncMonthYear);

document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
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
    HRMS.toast('Password updated. Signing out…', 'success');
    setTimeout(logout, 900);
  } catch (error) {
    messageEl.textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});

document.getElementById('settingsPasswordForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('settingsPwMessage');
  try {
    await api('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: document.getElementById('settingsCurrentPw').value,
        newPassword: document.getElementById('settingsNewPw').value
      })
    });
    msg.textContent = '';
    HRMS.toast('Password updated', 'success');
    setTimeout(logout, 900);
  } catch (error) {
    msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});

document.getElementById('leaveForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
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
    HRMS.toast('Leave request submitted', 'success');
    await loadMyLeaves();
  } catch (error) {
    HRMS.toast(error.message, 'error');
  }
});

async function loadMyLeaves() {
  const data = await api('/api/leaves/my-leaves');
  const tbody = document.getElementById('myLeavesBody');
  if (!tbody) return;
  tbody.innerHTML = data.leaves
    .map(
      (leave) => `
    <tr>
      <td>${leave.leavetype}</td>
      <td>${leave.fromdate}</td>
      <td>${leave.todate}</td>
      <td>${HRMS.badge(leave.status)}</td>
      <td>${leave.reason || '—'}</td>
    </tr>`
    )
    .join('');
  HRMS.initTableSearch('leaveHistoryTable', 'leaveHistorySearch');
}

HRMS.initSidebar({
  onNavigate: (section) => {
    if (section === 'calendar') loadCalendarView().catch(console.error);
  }
});
HRMS.initNavbarClock('navbarClock');
HRMS.initProfileDropdown();
HRMS.initNavbarSearch(['historyBody', 'myLeavesBody']);

if (user.mustchangepassword) {
  show('passwordChangeSection');
}

function showDashboardPasswordGate(message) {
  show('passwordChangeSection');
  const statEl = document.getElementById('employeeStatCards');
  if (statEl) {
    statEl.innerHTML = `
      <div class="panel" style="grid-column: 1 / -1; max-width: 560px;">
        <p class="panel-title" style="margin-top: 0;">Password update required</p>
        <p class="stat-sub" style="margin-bottom: 0;">${message || 'Change your password using the banner above. After that, sign in again and your attendance dashboard will load normally.'}</p>
      </div>`;
  }
}

(async function loadEmployeeDashboardInitial() {
  const loaders = [
    loadDashboardStats,
    loadTodaySection,
    loadAttendanceViews,
    loadCalendarView,
    loadMyLeaves
  ];
  const results = await Promise.allSettled(loaders.map((fn) => fn()));

  const passwordBlocked = results.some(
    (r) => r.status === 'rejected' && r.reason && r.reason.requiresPasswordChange
  );
  if (passwordBlocked) {
    const msg = results.find((r) => r.status === 'rejected')?.reason?.message;
    showDashboardPasswordGate(msg);
    return;
  }
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

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    const err = failed[0].reason;
    console.error(err);
    HRMS.toast(err && err.message ? err.message : 'Could not load dashboard data', 'error');
  }
})();
