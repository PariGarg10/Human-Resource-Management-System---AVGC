const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

let user = JSON.parse(localStorage.getItem('employee') || '{}');
const PERMS = window.HRMS_ADMIN_PERMS;

function isFounderProfile(profile) {
  const role = String(profile?.role || '').toLowerCase().trim();
  const name = String(profile?.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return role === 'founder' || name === 'ashish mishra';
}

if (user.role !== 'admin' && !isFounderProfile(user)) {
  localStorage.clear();
  window.location.href = '/login';
}

document.getElementById('sidebarUserName').textContent = user.name || 'Admin';
document.getElementById('sidebarAvatar').textContent = (user.name || 'A').charAt(0).toUpperCase();
document.getElementById('navProfileEmail').textContent = user.email || '';
const profileNameTile = document.getElementById('profileNameTile');
if (profileNameTile) profileNameTile.textContent = user.name || '—';
const profileDesignation = document.getElementById('profileDesignation');
if (profileDesignation) profileDesignation.textContent = user.designation || user.role || '—';
document.getElementById('profileDept').textContent = user.department || '—';
document.getElementById('profileCode').textContent = user.employeecode || '—';
document.getElementById('dailyDate').value = new Date().toISOString().slice(0, 10);
const attendanceImportDateEl = document.getElementById('attendanceImportDate');
if (attendanceImportDateEl) attendanceImportDateEl.value = new Date().toISOString().slice(0, 10);
document.getElementById('bioTimestamp').value = new Date().toISOString();
const reportFromEl = document.getElementById('reportFrom');
const reportToEl = document.getElementById('reportTo');
if (reportFromEl && reportToEl) {
  const now = new Date();
  reportFromEl.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  reportToEl.value = now.toISOString().slice(0, 10);
  const reportMonthFilter = document.getElementById('reportMonthFilter');
  const reportYearFilter = document.getElementById('reportYearFilter');
  if (reportMonthFilter) reportMonthFilter.value = String(now.getMonth() + 1);
  if (reportYearFilter) reportYearFilter.value = String(now.getFullYear());
}
const ROLE_OPTIONS = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
  { value: 'it_head', label: 'IT Head' },
];

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
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
    delete headers['content-type'];
  }
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
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

async function uploadHolidayFile(path, file) {
  const formData = new FormData();
  formData.append('file', file);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { method: 'POST', headers, body: formData });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (response.status === 401) {
    logout();
    throw new Error('Unauthorized — please sign in again');
  }
  if (response.status === 403 && data.requiresPasswordChange) {
    show('passwordChangeSection');
    throw new Error(data.message || 'Password change required');
  }
  if (!response.ok) {
    const detail = data.detail ? ` ${data.detail}` : '';
    throw new Error((data.message || `Upload failed (${response.status})`) + detail);
  }
  return data;
}

function requestStatusBadge(status) {
  return HRMS.badge(status || 'Open');
}

function requestRowsEmpty(colspan) {
  return `<tr><td colspan="${colspan}" class="stat-sub" style="padding:24px;text-align:center;">No requests found.</td></tr>`;
}

function requestFormData(prefix) {
  const fd = new FormData();
  fd.append('subject', document.getElementById(`${prefix}ReqSubject`).value.trim());
  fd.append('description', document.getElementById(`${prefix}ReqDescription`).value.trim());
  fd.append('raisedTo', document.getElementById(`${prefix}ReqRaisedTo`).value);
  fd.append('priority', document.getElementById(`${prefix}ReqPriority`).value);
  const file = document.getElementById(`${prefix}ReqAttachment`)?.files?.[0];
  if (file) fd.append('attachment', file);
  return fd;
}

function responseSummary(request) {
  const attachment = request.responseAttachmentUrl
    ? ` <a href="${escapeHtml(request.responseAttachmentUrl)}" target="_blank" rel="noreferrer">View file</a>`
    : '';
  return `${escapeHtml(request.response || '—')}${attachment}`;
}

function requestMessagesHtml(request) {
  const messages = request.messages?.length
    ? request.messages
    : request.response
      ? [{ authorName: 'Latest', body: request.response, attachmentUrl: request.responseAttachmentUrl }]
      : [];
  if (!messages.length) return '<p class="stat-sub">No replies yet.</p>';
  return messages
    .map((m) => {
      const file = m.attachmentUrl
        ? ` <a href="${escapeHtml(m.attachmentUrl)}" target="_blank" rel="noreferrer">View file</a>`
        : '';
      return `<div class="stat-sub" style="margin-bottom:8px;padding:8px;border-radius:8px;background:var(--bg-secondary);"><strong>${escapeHtml(m.authorName || 'Reply')}</strong><br/>${escapeHtml(m.body)}${file}</div>`;
    })
    .join('');
}

function responseFormHtml(requestId, prefix, showClose) {
  const closeBtn = showClose
    ? `<button type="button" class="btn btn-outline btn-sm" data-${prefix}-req-close="${requestId}">Reply &amp; close</button>`
    : '';
  return `
    <div style="margin-top:8px;">
      <textarea data-${prefix}-req-response="${requestId}" rows="2" placeholder="Write your reply..." style="padding:8px;border-radius:8px;border:1px solid var(--border);width:100%;"></textarea>
      <input type="file" data-${prefix}-req-file="${requestId}" style="margin-top:6px;font-size:12px;width:100%;" />
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
        <button type="button" class="btn btn-primary btn-sm" data-${prefix}-req-reply="${requestId}">Send reply</button>
        ${closeBtn}
      </div>
    </div>`;
}

function requestThreadCell(request, prefix, { showClose = false } = {}) {
  const waiting =
    request.status !== 'Closed' && !request.canReply
      ? '<p class="stat-sub" style="margin-top:6px;">Waiting for the other party to reply.</p>'
      : '';
  const form = request.canReply ? responseFormHtml(request.id, prefix, showClose) : '';
  return `<div style="min-width:260px;">${requestMessagesHtml(request)}${waiting}${form}</div>`;
}

function bindRequestReplyHandlers(root, prefix, reload) {
  if (!root) return;
  root.querySelectorAll(`[data-${prefix}-req-reply]`).forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await respondToAdminRequest(btn.getAttribute(`data-${prefix}-req-reply`), false, prefix);
        await reload();
      } catch (e) {
        HRMS.toast(e.message || 'Could not respond', 'error');
      }
    });
  });
  root.querySelectorAll(`[data-${prefix}-req-close]`).forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await respondToAdminRequest(btn.getAttribute(`data-${prefix}-req-close`), true, prefix);
        await reload();
      } catch (e) {
        HRMS.toast(e.message || 'Could not close request', 'error');
      }
    });
  });
}

async function submitAdminRequest(e) {
  e.preventDefault();
  const msg = document.getElementById('adminRequestMessage');
  if (msg) msg.textContent = '';
  try {
    await api('/api/concerns', { method: 'POST', body: requestFormData('admin') });
    HRMS.toast('Request submitted', 'success');
    e.target.reset();
    await Promise.all([loadAdminMyRequests(), loadAdminInboxRequests(), loadAdminAllRequests()]);
  } catch (err) {
    if (msg) msg.textContent = err.message;
    HRMS.toast(err.message || 'Could not submit request', 'error');
  }
}

async function reloadAdminRequests() {
  await Promise.all([loadAdminMyRequests(), loadAdminInboxRequests(), loadAdminAllRequests()]);
}

async function loadAdminMyRequests() {
  const data = await api('/api/concerns/my');
  const body = document.getElementById('adminMyRequestsBody');
  if (!body) return;
  const rows = data.concerns || [];
  body.innerHTML = rows.length
    ? rows
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.subject)}</td><td>${escapeHtml(r.raisedToName || '—')}</td><td>${escapeHtml(r.priority)}</td><td>${requestStatusBadge(r.status)}</td><td>${requestThreadCell(r, 'admin-my', { showClose: false })}</td></tr>`
        )
        .join('')
    : requestRowsEmpty(5);
  bindRequestReplyHandlers(body, 'admin-my', reloadAdminRequests);
}

async function respondToAdminRequest(id, close, prefix = 'admin') {
  const responseEl = document.querySelector(`[data-${prefix}-req-response="${id}"]`);
  const fileEl = document.querySelector(`[data-${prefix}-req-file="${id}"]`);
  const response = responseEl?.value?.trim() || '';
  if (!response) {
    HRMS.toast('Write a response first', 'error');
    return;
  }
  const fd = new FormData();
  fd.append('response', response);
  fd.append('close', close ? 'true' : 'false');
  if (fileEl?.files?.[0]) fd.append('responseAttachment', fileEl.files[0]);
  await api(`/api/concerns/${id}/respond`, {
    method: 'PATCH',
    body: fd,
  });
  HRMS.toast(close ? 'Request closed with response' : 'Response sent', 'success');
}

async function loadAdminInboxRequests() {
  const data = await api('/api/concerns/inbox');
  const body = document.getElementById('adminInboxRequestsBody');
  if (!body) return;
  const rows = data.concerns || [];
  body.innerHTML = rows.length
    ? rows
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.raisedByName || '—')}</td><td>${escapeHtml(r.subject)}</td><td>${escapeHtml(r.priority)}</td><td>${requestStatusBadge(r.status)}</td><td>${r.status === 'Closed' ? requestMessagesHtml(r) : requestThreadCell(r, 'admin', { showClose: true })}</td></tr>`
        )
        .join('')
    : requestRowsEmpty(5);
  bindRequestReplyHandlers(body, 'admin', reloadAdminRequests);
}

async function loadAdminAllRequests() {
  const data = await api('/api/concerns/all');
  const body = document.getElementById('adminAllRequestsBody');
  if (!body) return;
  const rows = data.concerns || [];
  body.innerHTML = rows.length
    ? rows
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.raisedByName || '—')}</td><td>${escapeHtml(r.raisedToName || '—')}</td><td>${escapeHtml(r.subject)}</td><td>${escapeHtml(r.priority)}</td><td>${requestStatusBadge(r.status)}<div style="margin-top:4px;">${requestMessagesHtml(r)}</div></td></tr>`
        )
        .join('')
    : requestRowsEmpty(5);
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

let currentReports = null;

const REPORT_DEFS = [
  {
    key: 'attendanceByEmployee',
    title: 'Attendance by employee/date range',
    columns: [
      ['code', 'Code'],
      ['name', 'Employee'],
      ['department', 'Department'],
      ['date', 'Date'],
      ['punchIn', 'Punch In'],
      ['punchOut', 'Punch Out'],
      ['totalHours', 'Hours'],
      ['status', 'Status'],
    ],
  },
  {
    key: 'leaveTakenVsBalance',
    title: 'Leave taken vs balance',
    columns: [
      ['code', 'Code'],
      ['name', 'Employee'],
      ['department', 'Department'],
      ['totalLeave', 'Total Leave'],
      ['usedLeave', 'Used Leave'],
      ['remainingLeave', 'Remaining Leave'],
    ],
  },
  {
    key: 'employeeDirectory',
    title: 'Employee directory',
    columns: [
      ['code', 'Code'],
      ['name', 'Employee'],
      ['email', 'Email'],
      ['department', 'Department'],
      ['role', 'Role'],
      ['registered', 'Registered'],
      ['createdAt', 'Created At'],
    ],
  },
  {
    key: 'requestStatus',
    title: 'Request/ticket status',
    columns: [
      ['id', 'ID'],
      ['raisedBy', 'Raised By'],
      ['raisedTo', 'Raised To'],
      ['subject', 'Subject'],
      ['priority', 'Priority'],
      ['status', 'Status'],
      ['createdAt', 'Created At'],
      ['respondedAt', 'Responded At'],
    ],
  },
  {
    key: 'presentAbsent',
    title: 'Present/Absent report',
    columns: [
      ['status', 'Status'],
      ['count', 'Count'],
    ],
  },
  {
    key: 'departmentWise',
    title: 'Department-wise report',
    columns: [
      ['department', 'Department'],
      ['present', 'Present'],
      ['halfday', 'Half Day'],
      ['leave', 'Leave'],
      ['absent', 'Absent'],
      ['holiday', 'Holiday'],
    ],
  },
  {
    key: 'monthlySummary',
    title: 'Monthly attendance summary',
    columns: [
      ['code', 'Code'],
      ['name', 'Employee'],
      ['department', 'Department'],
      ['present', 'Present'],
      ['halfday', 'Half Day'],
      ['leave', 'Leave'],
      ['absent', 'Absent'],
      ['holiday', 'Holiday'],
      ['totalHours', 'Total Hours'],
    ],
  },
  {
    key: 'odApproval',
    title: 'OD approval report',
    columns: [
      ['id', 'ID'],
      ['raisedBy', 'Raised By'],
      ['raisedTo', 'Raised To'],
      ['subject', 'Subject'],
      ['priority', 'Priority'],
      ['status', 'Status'],
      ['createdAt', 'Created At'],
      ['respondedAt', 'Responded At'],
    ],
  },
];

const EXTRA_REPORT_DEFS = [
  {
    key: 'allAttendanceRecords',
    title: 'All Attendance records',
    columns: REPORT_DEFS[0].columns,
  },
  {
    key: 'monthWiseAttendance',
    title: 'Month-wise Attendance report',
    columns: REPORT_DEFS[6].columns,
  },
  {
    key: 'leaveRecords',
    title: 'Leave records',
    columns: [
      ['code', 'Code'],
      ['name', 'Employee'],
      ['department', 'Department'],
      ['leaveType', 'Leave Type'],
      ['fromDate', 'From'],
      ['toDate', 'To'],
      ['status', 'Status'],
      ['approvedBy', 'Approved By'],
      ['reason', 'Reason'],
    ],
  },
  {
    key: 'combinedAttendanceLeave',
    title: 'Combined Attendance + Leave report',
    columns: [
      ['code', 'Code'],
      ['name', 'Employee'],
      ['department', 'Department'],
      ['date', 'Date'],
      ['punchIn', 'Punch In'],
      ['punchOut', 'Punch Out'],
      ['totalHours', 'Hours'],
      ['status', 'Attendance Status'],
      ['leaveType', 'Leave Type'],
      ['leaveStatus', 'Leave Status'],
    ],
  },
  {
    key: 'allEmployeeData',
    title: 'All Employee data report',
    columns: REPORT_DEFS[2].columns,
  },
];

const REPORT_DEF_BY_KEY = new Map([...REPORT_DEFS, ...EXTRA_REPORT_DEFS].map((def) => [def.key, def]));

function reportCell(value) {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (String(value).includes('T') && !Number.isNaN(Date.parse(value))) return formatDateTime(value);
  return value;
}

function renderReportTable(def, rows) {
  const body = rows.length
    ? rows
        .slice(0, 250)
        .map(
          (row) => `<tr>${def.columns.map(([key]) => `<td>${escapeHtml(reportCell(row[key]))}</td>`).join('')}</tr>`
        )
        .join('')
    : `<tr><td colspan="${def.columns.length}" class="stat-sub" style="padding:18px;text-align:center;">No rows found.</td></tr>`;
  const note = rows.length > 250 ? `<p class="stat-sub">Showing 250 of ${rows.length} rows. Export includes all rows.</p>` : '';
  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">${escapeHtml(def.title)}</h3>
          <p class="stat-sub">${rows.length} row(s)</p>
        </div>
        <button type="button" class="btn btn-outline btn-sm" data-report-export="${def.key}">Export Excel</button>
      </div>
      ${note}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${def.columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>`;
}

function excelEscape(value) {
  return escapeHtml(reportCell(value));
}

function exportReportToExcel(def, rows, suffix) {
  const table = `
    <table>
      <thead><tr>${def.columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map((row) => `<tr>${def.columns.map(([key]) => `<td>${excelEscape(row[key])}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>`;
  const blob = new Blob([`<html><meta charset="utf-8"><body>${table}</body></html>`], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${def.key}-${suffix}.xls`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

function exportAllReportsToExcel() {
  if (!currentReports) return HRMS.toast('Load reports first', 'error');
  const suffix = `${currentReports.range.from}-to-${currentReports.range.to}`;
  const sheets = REPORT_DEFS.map((def) => {
    const rows = currentReports.reports[def.key] || [];
    return `<h2>${escapeHtml(def.title)}</h2>
      <table>
        <thead><tr>${def.columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${def.columns.map(([key]) => `<td>${excelEscape(row[key])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
  }).join('<br />');
  const blob = new Blob([`<html><meta charset="utf-8"><body>${sheets}</body></html>`], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `admin-reports-${suffix}.xls`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

function exportReportToPdf(def, rows, suffix) {
  const table = `
    <table>
      <thead><tr>${def.columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${def.columns.map(([key]) => `<td>${excelEscape(row[key])}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  const win = window.open('', '_blank');
  if (!win) return HRMS.toast('Allow popups to export PDF', 'error');
  win.document.write(`
    <html>
      <head>
        <title>${escapeHtml(def.title)} ${escapeHtml(suffix)}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:24px;color:#111827;}
          h1{font-size:20px;margin:0 0 6px;}
          p{margin:0 0 16px;color:#6b7280;}
          table{width:100%;border-collapse:collapse;font-size:11px;}
          th,td{border:1px solid #d1d5db;padding:6px;text-align:left;vertical-align:top;}
          th{background:#f3f4f6;}
        </style>
      </head>
      <body><h1>${escapeHtml(def.title)}</h1><p>${escapeHtml(suffix)}</p>${table}</body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

function reportRangeFromMonthYear() {
  const month = Number(document.getElementById('reportMonthFilter')?.value);
  const year = Number(document.getElementById('reportYearFilter')?.value);
  if (!month || !year) return null;
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to, month, year };
}

function reportQueryFromFilters() {
  const range = reportRangeFromMonthYear();
  const from = range?.from || document.getElementById('reportFrom')?.value;
  const to = range?.to || document.getElementById('reportTo')?.value;
  if (range) {
    const fromEl = document.getElementById('reportFrom');
    const toEl = document.getElementById('reportTo');
    if (fromEl) fromEl.value = from;
    if (toEl) toEl.value = to;
  }
  const query = new URLSearchParams({ from, to });
  const employeeId = document.getElementById('reportEmployeeFilter')?.value;
  if (employeeId) query.set('employeeId', employeeId);
  return query.toString();
}

async function loadAdminReports() {
  const container = document.getElementById('adminReportsContainer');
  const cards = document.getElementById('reportsSummaryCards');
  if (!container || !cards) return;
  container.innerHTML = '<div class="panel"><p class="stat-sub">Loading reports…</p></div>';
  const data = await api(`/api/admin/reports?${reportQueryFromFilters()}`);
  currentReports = data;
  const reports = data.reports || {};
  cards.innerHTML = `
    <div class="stat-card"><div class="stat-label">Attendance rows</div><div class="stat-value">${(reports.attendanceByEmployee || []).length}</div></div>
    <div class="stat-card stat-success"><div class="stat-label">Employees</div><div class="stat-value">${(reports.employeeDirectory || []).length}</div></div>
    <div class="stat-card stat-warning"><div class="stat-label">Requests</div><div class="stat-value">${(reports.requestStatus || []).length}</div></div>
    <div class="stat-card stat-info"><div class="stat-label">OD Requests</div><div class="stat-value">${(reports.odApproval || []).length}</div></div>
  `;
  container.innerHTML = REPORT_DEFS.map((def) => renderReportTable(def, reports[def.key] || [])).join('');
  container.querySelectorAll('[data-report-export]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-report-export');
      const def = REPORT_DEFS.find((r) => r.key === key);
      if (!def) return;
      exportReportToExcel(def, reports[key] || [], `${data.range.from}-to-${data.range.to}`);
    });
  });
}

async function loadReportEmployeeFilter() {
  const select = document.getElementById('reportEmployeeFilter');
  if (!select) return;
  const data = await api('/api/admin/employees');
  select.innerHTML = '<option value="">All employees</option>' + (data.employees || [])
    .map((emp) => `<option value="${emp.id}">${escapeHtml(emp.name)} (${escapeHtml(emp.employeecode || '—')})</option>`)
    .join('');
}

function selectedReportDef() {
  const key = document.getElementById('reportTypeSelect')?.value || 'allAttendanceRecords';
  return REPORT_DEF_BY_KEY.get(key) || REPORT_DEF_BY_KEY.get('allAttendanceRecords');
}

function selectedReportRows() {
  if (!currentReports) return null;
  const def = selectedReportDef();
  return { def, rows: currentReports.reports?.[def.key] || [] };
}

async function loadAdminLeaveBalance() {
  const grid = document.getElementById('adminLeaveBalanceGrid');
  const summary = document.getElementById('adminLeaveBalanceSummary');
  if (!grid || !summary || !user.id) return;
  try {
    const data = await api(`/api/leave-balance/${user.id}`);
    const totals = data.totals || { remaining: 0, total: 0, used: 0 };
    summary.textContent = `${totals.remaining} of ${totals.total} days remaining (${totals.used} used)`;
    grid.innerHTML = (data.balances || [])
      .map(
        (item) => `
    <div class="tile">
      <strong>${escapeHtml(item.type)}</strong>
      <span class="stat-sub" style="display:block;margin:4px 0;">${escapeHtml(item.periodLabel || 'Yearly')}</span>
      <span>${item.remaining} remaining</span>
      <small class="stat-sub">${item.used} used of ${item.total}</small>
    </div>`
      )
      .join('');
  } catch (e) {
    summary.textContent = e.message || 'Could not load leave balance';
    grid.innerHTML = '';
  }
}

async function removeEmployee(employeeId, employeeName) {
  const label = employeeName || `ID ${employeeId}`;
  if (!window.confirm(`Remove employee "${label}"? This cannot be undone.`)) return;
  await api(`/api/admin/employees/${employeeId}`, { method: 'DELETE' });
  HRMS.toast('Employee removed', 'success');
  await Promise.all([loadEmployees(), loadRoleManagement(), loadAdminStats()]);
  window.HRMS?.refreshTeamHubPanels?.();
}

async function loadEmployees() {
  const body = document.getElementById('employeesBody');
  if (!body) return;
  const data = await api('/api/admin/employees');
  const employees = data.employees || [];
  body.innerHTML = employees.length
    ? employees
        .map((emp) => {
          const isSelf = Number(emp.id) === Number(user.id);
          const removeBtn = isSelf
            ? '<span class="stat-sub">—</span>'
            : `<button type="button" class="btn btn-outline btn-sm" data-remove-employee="${emp.id}">Remove</button>`;
          return `<tr><td>${emp.id}</td><td>${escapeHtml(emp.employeecode)}</td><td>${escapeHtml(emp.name)}</td><td>${escapeHtml(emp.email)}</td><td>${escapeHtml(emp.department || '—')}</td><td>${escapeHtml(emp.role || 'employee')}</td><td>${removeBtn}</td></tr>`;
        })
        .join('')
    : '<tr><td colspan="7" class="stat-sub" style="padding:24px;text-align:center;">No employees found.</td></tr>';
  body.querySelectorAll('[data-remove-employee]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-remove-employee');
      const row = btn.closest('tr');
      const name = row?.children?.[2]?.textContent?.trim();
      try {
        await removeEmployee(id, name);
      } catch (e) {
        HRMS.toast(e.message || 'Could not remove employee', 'error');
      }
    });
  });
}

async function loadRoleManagement() {
  const body = document.getElementById('rolesBody');
  if (!body) return;
  const msg = document.getElementById('rolesMessage');
  if (msg) msg.textContent = '';
  try {
    const data = await api('/api/admin/employees');
    const employees = data.employees || [];
    body.innerHTML = employees.length
      ? employees
          .map(
            (emp) => `
      <tr>
        <td>${emp.id}</td>
        <td>${escapeHtml(emp.employeecode)}</td>
        <td>${escapeHtml(emp.name)}</td>
        <td>${escapeHtml(emp.email)}</td>
        <td>${escapeHtml(emp.department || '—')}</td>
        <td>${escapeHtml(emp.role || 'employee')}</td>
        <td>
          <input data-role-input="${emp.id}" value="${escapeHtml(emp.role || 'employee')}" placeholder="Type role name" style="padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);min-width:160px;width:100%;" />
        </td>
        <td><button type="button" class="btn btn-primary btn-sm" data-role-save="${emp.id}">Save role</button></td>
      </tr>`
          )
          .join('')
      : '<tr><td colspan="8" class="stat-sub" style="padding:24px;text-align:center;">No employees found.</td></tr>';

    body.querySelectorAll('button[data-role-save]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-role-save');
        const input = body.querySelector(`input[data-role-input="${id}"]`);
        if (!id || !input) return;
        try {
          await api(`/api/admin/employees/${id}/role`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: input.value.trim() }),
          });
          HRMS.toast('Role updated', 'success');
          window.HRMS?.refreshTeamHubPanels?.();
          await Promise.all([loadRoleManagement(), loadEmployees(), loadAdminStats()]);
        } catch (error) {
          HRMS.toast(error.message || 'Could not update role', 'error');
          if (msg) msg.textContent = error.message || 'Could not update role';
        }
      });
    });
  } catch (error) {
    body.innerHTML = '';
    if (msg) msg.textContent = error.message || 'Could not load roles';
    HRMS.toast(error.message || 'Could not load roles', 'error');
  }
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
document.getElementById('loadRolesBtn')?.addEventListener('click', () => loadRoleManagement().catch((e) => HRMS.toast(e.message, 'error')));
document.getElementById('loadReportsBtn')?.addEventListener('click', () => loadAdminReports().catch((e) => HRMS.toast(e.message, 'error')));
document.getElementById('exportAllReportsBtn')?.addEventListener('click', exportAllReportsToExcel);
document.getElementById('generateReportBtn')?.addEventListener('click', () => loadAdminReports().catch((e) => HRMS.toast(e.message, 'error')));
document.getElementById('exportSelectedReportExcelBtn')?.addEventListener('click', () => {
  const selected = selectedReportRows();
  if (!selected) return HRMS.toast('Generate reports first', 'error');
  exportReportToExcel(selected.def, selected.rows, `${currentReports.range.from}-to-${currentReports.range.to}`);
});
document.getElementById('exportSelectedReportPdfBtn')?.addEventListener('click', () => {
  const selected = selectedReportRows();
  if (!selected) return HRMS.toast('Generate reports first', 'error');
  exportReportToPdf(selected.def, selected.rows, `${currentReports.range.from}-to-${currentReports.range.to}`);
});

document.getElementById('newManagerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('mgrMessage');
  try {
    const result = await api('/api/admin/managers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('mgrName').value.trim(),
        email: document.getElementById('mgrEmail').value.trim(),
        password: document.getElementById('mgrPassword').value,
        department: document.getElementById('mgrDept').value.trim()
      })
    });
    HRMS.toast(result.promoted ? 'Employee promoted to manager' : 'Manager created', 'success');
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
    const attendanceDate = document.getElementById('attendanceImportDate')?.value;
    if (attendanceDate) formData.append('attendanceDate', attendanceDate);
    const result = await api('/api/admin/import-attendance', { method: 'POST', body: formData });
    const failed = result.failedrows || 0;
    const skipped = result.skipped || 0;
    const imported = result.successfulimports || 0;
    HRMS.toast(
      `${imported} imported, ${skipped} skipped, ${failed} failed`,
      failed ? 'warning' : 'success'
    );
    msg.textContent = '';
    let summary = `Total: ${result.totalrows}, Imported: ${imported}, Skipped (no HRMS match): ${skipped}, Failed: ${failed}`;
    if (result.skippedDetails?.length) {
      const skipLines = result.skippedDetails
        .slice(0, 8)
        .map((s) => `Row ${s.row}: "${s.name}" — ${s.reason}`);
      summary += `\nSkipped:\n${skipLines.join('\n')}${result.skipped > 8 ? '\n…' : ''}`;
    }
    if (result.errors?.length) {
      const lines = result.errors.slice(0, 8).map((e) => `Row ${e.row}: ${e.error}`);
      summary += `\nFailed:\n${lines.join('\n')}${result.errors.length > 8 ? '\n…' : ''}`;
    }
    summaryEl.style.whiteSpace = 'pre-wrap';
    summaryEl.textContent = summary;
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

let leaveEntitlementEmployees = [];

function resetLeaveEntitlementForm() {
  document.getElementById('leaveEntitlementId').value = '';
  document.getElementById('leaveEntitlementType').value = '';
  document.getElementById('leaveEntitlementDays').value = '';
  document.getElementById('leaveEntitlementPeriod').value = 'yearly';
  document.getElementById('leaveEntitlementEmployee').value = '';
  document.getElementById('leaveEntitlementSubmitBtn').textContent = 'Add allowance';
  document.getElementById('leaveEntitlementCancelBtn')?.classList.add('hidden');
}

function periodLabel(period) {
  if (period === 'monthly') return 'Monthly';
  if (period === 'quarterly') return 'Quarterly';
  return 'Yearly';
}

async function ensureLeaveEntitlementEmployeeOptions() {
  const select = document.getElementById('leaveEntitlementEmployee');
  if (!select || leaveEntitlementEmployees.length) return;
  const data = await api('/api/admin/employees');
  leaveEntitlementEmployees = data.employees || [];
  const current = select.value;
  select.innerHTML =
    '<option value="">Everyone (organization)</option>' +
    leaveEntitlementEmployees
      .map(
        (emp) =>
          `<option value="${emp.id}">${escapeHtml(emp.name)} (${escapeHtml(emp.employeecode)})</option>`
      )
      .join('');
  if (current) select.value = current;
}

async function loadLeaveEntitlements() {
  const body = document.getElementById('leaveEntitlementsBody');
  if (!body) return;
  const msg = document.getElementById('leaveEntitlementMessage');
  if (msg) msg.textContent = '';
  try {
    await ensureLeaveEntitlementEmployeeOptions();
    const data = await api('/api/admin/leave-entitlements');
    const rows = data.entitlements || [];
    body.innerHTML = rows.length
      ? rows
          .map((row) => {
            const scope = row.employeeId
              ? `${escapeHtml(row.employeeName || 'Employee')} (${escapeHtml(row.employeeCode || row.employeeId)})`
              : 'Everyone';
            return `<tr>
              <td>${escapeHtml(row.leaveType)}</td>
              <td>${row.allottedDays}</td>
              <td>${escapeHtml(row.periodLabel || periodLabel(row.period))}</td>
              <td>${scope}</td>
              <td style="white-space:nowrap;">
                <button type="button" class="btn btn-outline btn-sm" data-edit-entitlement="${row.id}">Edit</button>
                <button type="button" class="btn btn-outline btn-sm" data-delete-entitlement="${row.id}">Remove</button>
              </td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="5" class="stat-sub" style="padding:24px;text-align:center;">No leave allowances configured yet.</td></tr>';

    body.querySelectorAll('[data-edit-entitlement]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = rows.find((r) => String(r.id) === btn.getAttribute('data-edit-entitlement'));
        if (!row) return;
        document.getElementById('leaveEntitlementId').value = row.id;
        document.getElementById('leaveEntitlementType').value = row.leaveType;
        document.getElementById('leaveEntitlementDays').value = row.allottedDays;
        document.getElementById('leaveEntitlementPeriod').value = row.period;
        document.getElementById('leaveEntitlementEmployee').value = row.employeeId || '';
        document.getElementById('leaveEntitlementSubmitBtn').textContent = 'Save changes';
        document.getElementById('leaveEntitlementCancelBtn')?.classList.remove('hidden');
        document.getElementById('leaveEntitlementType')?.focus();
      });
    });

    body.querySelectorAll('[data-delete-entitlement]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete-entitlement');
        const row = rows.find((r) => String(r.id) === id);
        if (!window.confirm(`Remove allowance for "${row?.leaveType || 'this type'}"?`)) return;
        try {
          await api(`/api/admin/leave-entitlements/${id}`, { method: 'DELETE' });
          HRMS.toast('Allowance removed', 'success');
          resetLeaveEntitlementForm();
          await loadLeaveEntitlements();
          loadAdminLeaveBalance().catch(() => {});
        } catch (e) {
          HRMS.toast(e.message || 'Could not remove', 'error');
        }
      });
    });
  } catch (e) {
    body.innerHTML = '';
    if (msg) msg.textContent = e.message || 'Could not load allowances';
    HRMS.toast(e.message || 'Could not load allowances', 'error');
  }
}

document.getElementById('leaveEntitlementForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('leaveEntitlementMessage');
  if (msg) msg.textContent = '';
  const id = document.getElementById('leaveEntitlementId').value.trim();
  const payload = {
    leaveType: document.getElementById('leaveEntitlementType').value.trim(),
    allottedDays: Number(document.getElementById('leaveEntitlementDays').value),
    period: document.getElementById('leaveEntitlementPeriod').value,
    employeeId: document.getElementById('leaveEntitlementEmployee').value || null,
  };
  try {
    if (id) {
      await api(`/api/admin/leave-entitlements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      HRMS.toast('Allowance updated', 'success');
    } else {
      await api('/api/admin/leave-entitlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      HRMS.toast('Allowance added', 'success');
    }
    resetLeaveEntitlementForm();
    await loadLeaveEntitlements();
    loadAdminLeaveBalance().catch(() => {});
  } catch (err) {
    if (msg) msg.textContent = err.message;
    HRMS.toast(err.message || 'Could not save allowance', 'error');
  }
});

document.getElementById('leaveEntitlementCancelBtn')?.addEventListener('click', () => {
  resetLeaveEntitlementForm();
  const msg = document.getElementById('leaveEntitlementMessage');
  if (msg) msg.textContent = '';
});

document.getElementById('loadLeaveEntitlementsBtn')?.addEventListener('click', () => {
  loadLeaveEntitlements().catch((e) => HRMS.toast(e.message, 'error'));
});

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

async function loadAdminLeaveSummary() {
  const cards = document.getElementById('adminLeaveSummaryCards');
  const body = document.getElementById('adminLeaveSummaryBody');
  if (!cards || !body) return;
  const data = await api('/api/admin/leaves?status=pending');
  const leaves = data.leaves || [];
  const byType = new Map();
  for (const leave of leaves) {
    const type = leave.leavetype || 'Other';
    byType.set(type, (byType.get(type) || 0) + 1);
  }
  cards.innerHTML = `
    <div class="stat-card stat-warning"><div class="stat-label">Total leaves pending</div><div class="stat-value">${leaves.length}</div></div>
    <div class="stat-card"><div class="stat-label">Leave types pending</div><div class="stat-value">${byType.size}</div></div>
  `;
  body.innerHTML = byType.size
    ? Array.from(byType.entries())
        .map(([type, count]) => `<tr><td>${escapeHtml(type)}</td><td>${count}</td></tr>`)
        .join('')
    : '<tr><td colspan="2" class="stat-sub" style="padding:18px;text-align:center;">No pending leaves.</td></tr>';
}

window.processLeave = async (id, action) => {
  try {
    await api(`/api/admin/leaves/${id}/${action}`, { method: 'PUT' });
    HRMS.toast(action === 'approve' ? 'Leave approved' : 'Leave rejected', 'success');
    await loadAdminLeaves();
    await loadAdminLeaveSummary();
    await loadAdminStats();
  } catch (error) {
    HRMS.toast(error.message, 'error');
  }
};
document.getElementById('loadAdminLeavesBtn').addEventListener('click', () => loadAdminLeaves().catch((e) => HRMS.toast(e.message, 'error')));
document.getElementById('loadAdminLeaveSummaryBtn')?.addEventListener('click', () => loadAdminLeaveSummary().catch((e) => HRMS.toast(e.message, 'error')));

document.getElementById('broadcastForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('broadcastResult');
  const input = document.getElementById('broadcastMessage');
  if (msg) msg.textContent = '';
  try {
    const message = input.value.trim();
    if (!message) {
      if (msg) msg.textContent = 'Message is required.';
      return;
    }
    const data = await api('/api/notifications/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    input.value = '';
    if (msg) msg.textContent = `Broadcast sent to ${data.count || 0} recipient(s).`;
    HRMS.toast('Broadcast sent', 'success');
  } catch (error) {
    if (msg) msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});

document.getElementById('adminRequestForm')?.addEventListener('submit', submitAdminRequest);
document.getElementById('loadAdminMyRequestsBtn')?.addEventListener('click', () => {
  loadAdminMyRequests().catch((e) => HRMS.toast(e.message, 'error'));
});
document.getElementById('loadAdminInboxRequestsBtn')?.addEventListener('click', () => {
  loadAdminInboxRequests().catch((e) => HRMS.toast(e.message, 'error'));
});
document.getElementById('loadAdminAllRequestsBtn')?.addEventListener('click', () => {
  loadAdminAllRequests().catch((e) => HRMS.toast(e.message, 'error'));
});

function esslDateRangeInputs() {
  const fromEl = document.getElementById('esslFromDate');
  const toEl = document.getElementById('esslToDate');
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (fromEl && !fromEl.value) fromEl.value = weekAgo.toISOString().slice(0, 10);
  if (toEl && !toEl.value) toEl.value = today.toISOString().slice(0, 10);
  return {
    from: fromEl?.value,
    to: toEl?.value,
    matched: document.getElementById('esslFilterMatched')?.value || '',
    imported: document.getElementById('esslFilterImported')?.value || '',
  };
}

function formatEsslDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

async function loadEsslPunchList() {
  const { from, to, matched, imported } = esslDateRangeInputs();
  const body = document.getElementById('esslPunchesBody');
  const stats = document.getElementById('esslStatsLine');
  if (!from || !to) {
    HRMS.toast('Choose from and to dates', 'error');
    return;
  }
  if (body) body.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
  const params = new URLSearchParams({ from, to });
  if (matched) params.set('matched', matched);
  if (imported) params.set('imported', imported);
  const data = await api(`/api/admin/attendance/essl-logs?${params}`);
  const s = data.stats || {};
  if (stats) {
    stats.textContent = `${s.total ?? 0} punch(es) · ${s.matched ?? 0} matched to employees · ${s.imported ?? 0} in attendance DB · ${s.pending_import ?? 0} ready to import`;
  }
  const logs = data.logs || [];
  if (!body) return;
  if (!logs.length) {
    body.innerHTML = '<tr><td colspan="6" class="stat-sub">No device punches in this range. Run Sync device now (local server + office network).</td></tr>';
    return;
  }
  body.innerHTML = logs
    .map(
      (row) => `
    <tr>
      <td>${formatEsslDateTime(row.recordTime)}</td>
      <td>${escapeHtml(row.deviceUserId || '—')}</td>
      <td>${escapeHtml(row.employeecode || '—')}</td>
      <td>${escapeHtml(row.employeeName || '—')}</td>
      <td>${row.matched ? 'Yes' : 'No'}</td>
      <td>${row.importedAt ? 'Yes' : 'No'}</td>
    </tr>`
    )
    .join('');
}

document.getElementById('esslRefreshBtn')?.addEventListener('click', () => {
  loadEsslPunchList().catch((e) => HRMS.toast(e.message, 'error'));
});

document.getElementById('esslImportBtn')?.addEventListener('click', async () => {
  const msg = document.getElementById('esslSyncMessage');
  const btn = document.getElementById('esslImportBtn');
  const { from, to } = esslDateRangeInputs();
  if (!from || !to) {
    HRMS.toast('Choose from and to dates', 'error');
    return;
  }
  if (msg) msg.textContent = 'Importing matched punches into attendance…';
  if (btn) btn.disabled = true;
  try {
    const data = await api('/api/admin/attendance/essl-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, onlyPending: true }),
    });
    const text = `Imported ${data.punchesImported ?? 0} punch(es) across ${data.daysUpdated ?? 0} employee day(s). Skipped ${data.skipped ?? 0} (unmatched or outside work hours).`;
    if (msg) msg.textContent = text;
    HRMS.toast(text, 'success');
    await loadEsslPunchList();
  } catch (error) {
    if (msg) msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
});

document.getElementById('esslSyncBtn')?.addEventListener('click', async () => {
  const msg = document.getElementById('esslSyncMessage');
  const btn = document.getElementById('esslSyncBtn');
  if (msg) msg.textContent = 'Syncing from device…';
  if (btn) btn.disabled = true;
  try {
    const data = await api('/api/admin/attendance/essl-sync', { method: 'POST' });
    const text = data.skipped && data.reason
      ? `Skipped: ${data.reason}`
      : data.error
        ? `Error: ${data.error}`
        : `Synced — received ${data.received ?? 0}, matched ${data.matched ?? 0}, ${data.daysUpdated ?? 0} day(s) updated in attendance.`;
    if (msg) msg.textContent = text;
    HRMS.toast(text, data.error ? 'error' : 'success');
    await loadEsslPunchList();
  } catch (error) {
    if (msg) msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
});

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

function validateNewPassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-zA-Z]/.test(password)) return 'Password must include at least one letter';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number';
  return null;
}

async function submitPasswordChange({ currentPassword, newPassword, messageEl, formEl }) {
  const strengthError = validateNewPassword(newPassword);
  if (strengthError) {
    if (messageEl) messageEl.textContent = strengthError;
    HRMS.toast(strengthError, 'error');
    return;
  }
  await api('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  HRMS.toast('Password updated. Please sign in again.', 'success');
  if (messageEl) messageEl.textContent = '';
  if (formEl) formEl.reset();
  setTimeout(logout, 900);
}

document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await submitPasswordChange({
      currentPassword: document.getElementById('currentPassword').value,
      newPassword: document.getElementById('newPassword').value,
      messageEl: document.getElementById('passwordChangeMessage'),
      formEl: e.target,
    });
  } catch (error) {
    document.getElementById('passwordChangeMessage').textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});

document.getElementById('adminProfilePasswordForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('adminProfilePasswordMessage');
  if (msg) msg.textContent = '';
  const newPassword = document.getElementById('profileNewPassword').value;
  const confirmPassword = document.getElementById('profileConfirmPassword').value;
  if (newPassword !== confirmPassword) {
    const text = 'New passwords do not match';
    if (msg) msg.textContent = text;
    HRMS.toast(text, 'error');
    return;
  }
  try {
    await submitPasswordChange({
      currentPassword: document.getElementById('profileCurrentPassword').value,
      newPassword,
      messageEl: msg,
      formEl: e.target,
    });
  } catch (error) {
    if (msg) msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
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

function applyAdminProfileToForm(profile) {
  if (!profile) return;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v != null ? String(v) : '';
  };
  set('adminProfileName', profile.name || '');
  set('adminProfileEmail', profile.email || '');
  set('adminProfilePhone', profile.phone || '');
  set('adminProfileLocation', profile.location || '');
  set('adminProfileBio', profile.bio || '');
  set('adminProfileDob', profile.dateOfBirth || '');
  const initEl = document.getElementById('profilePhotoInitial');
  const img = document.getElementById('profilePhotoPreview');
  if (img && initEl) {
    if (profile.profilePhotoUrl) {
      img.src = HRMS.profilePhotoSrc(profile.profilePhotoUrl);
      img.classList.remove('hidden');
      initEl.classList.add('hidden');
    } else {
      img.removeAttribute('src');
      img.classList.add('hidden');
      initEl.classList.remove('hidden');
      initEl.textContent = (profile.name || '?').charAt(0).toUpperCase();
    }
  }
}

async function loadAdminProfileFromServer() {
  try {
    const { profile } = await api('/api/users/me');
    applyAdminProfileToForm(profile);
    const prev = JSON.parse(localStorage.getItem('employee') || '{}');
    const merged = {
      ...prev,
      name: profile.name,
      email: profile.email,
      department: profile.department,
      employeecode: profile.employeecode,
      profilePhotoUrl: profile.profilePhotoUrl,
      avatar_url: profile.profilePhotoUrl || prev.avatar_url,
    };
    localStorage.setItem('employee', JSON.stringify(merged));
    const chip = document.querySelector('.profile-chip');
    if (chip) chip.setAttribute('title', profile.email || '');
    const navLabel = document.getElementById('navProfileEmail');
    if (navLabel) navLabel.textContent = profile.name || profile.email || '—';
    document.getElementById('sidebarUserName').textContent = profile.name || 'Admin';
    const aph = document.getElementById('adminProfileHeading');
    if (aph) aph.textContent = profile.name || 'Profile';
    if (profile.profilePhotoUrl) {
      HRMS.updateAvatarEverywhere(profile.profilePhotoUrl, profile.name);
    } else {
      const side = document.getElementById('sidebarAvatar');
      if (side) side.textContent = (profile.name || 'A').charAt(0).toUpperCase();
      document.getElementById('navAvatar')?.classList.add('hidden');
    }
    document.getElementById('profileDept').textContent = profile.department || '—';
    document.getElementById('profileCode').textContent = profile.employeecode || '—';
    const nameTile = document.getElementById('profileNameTile');
    if (nameTile) nameTile.textContent = profile.name || '—';
    const designationTile = document.getElementById('profileDesignation');
    if (designationTile) designationTile.textContent = profile.designation || profile.role || '—';
  } catch (_e) {}
}

async function refreshBirthdayBanner() {
  try {
    const data = await api('/api/notifications');
    const list = data.birthdaysToday || [];
    const el = document.getElementById('birthdayBanner');
    const txt = document.getElementById('birthdayBannerText');
    if (!el || !txt) return;
    if (!list.length) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    txt.textContent = `🎂 Birthdays Today: ${list.map((b) => b.name || 'Colleague').join(', ')}`;
  } catch (_e) {
    document.getElementById('birthdayBanner')?.classList.add('hidden');
  }
}

document.getElementById('adminProfilePhoto')?.addEventListener('change', (e) => {
  const err = document.getElementById('adminProfilePhotoErr');
  if (err) err.textContent = '';
  const f = e.target.files?.[0];
  if (!f) return;
  if (!/^image\/(jpeg|png|gif|webp)$/i.test(f.type)) {
    if (err) err.textContent = 'Please choose a JPEG, PNG, GIF, or WebP image.';
    e.target.value = '';
    return;
  }
  if (f.size > 3 * 1024 * 1024) {
    if (err) err.textContent = 'Image must be 3MB or smaller.';
    e.target.value = '';
    return;
  }
  const url = URL.createObjectURL(f);
  const img = document.getElementById('profilePhotoPreview');
  const initEl = document.getElementById('profilePhotoInitial');
  if (img && initEl) {
    img.src = url;
    img.classList.remove('hidden');
    initEl.classList.add('hidden');
  }
});

document.getElementById('adminProfileForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('adminProfileMessage');
  if (msg) msg.textContent = '';
  try {
    const fd = new FormData();
    fd.append('name', document.getElementById('adminProfileName').value.trim());
    fd.append('phone', document.getElementById('adminProfilePhone').value.trim());
    fd.append('location', document.getElementById('adminProfileLocation').value.trim());
    fd.append('bio', document.getElementById('adminProfileBio').value.trim());
    fd.append('dateOfBirth', document.getElementById('adminProfileDob').value.trim());
    const file = document.getElementById('adminProfilePhoto').files[0];
    if (file) fd.append('profilePhoto', file);
    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Save failed');
    HRMS.toast('Profile saved successfully ✓', 'success');
    const photoInput = document.getElementById('adminProfilePhoto');
    if (photoInput) photoInput.value = '';
    if (data.profile?.profilePhotoUrl) {
      HRMS.updateAvatarEverywhere(data.profile.profilePhotoUrl, data.profile.name);
    }
    HRMS.syncNavProfileName(
      data.profile?.name || document.getElementById('adminProfileName').value.trim(),
      data.profile?.email || ''
    );
    await loadAdminProfileFromServer();
  } catch (err) {
    if (msg) msg.textContent = err.message;
    HRMS.toast(err.message, 'error');
  }
});

let employeeImportReady = false;

function selectedEmployeeImportFile() {
  return document.getElementById('employeeImportFile')?.files?.[0] || null;
}

function employeeImportFormData(file) {
  const formData = new FormData();
  formData.append('file', file);
  if (document.getElementById('employeeImportUpdateExisting')?.checked) {
    formData.append('onDuplicate', 'update');
  } else {
    formData.append('onDuplicate', 'skip');
  }
  if (document.getElementById('employeeImportAutoCode')?.checked) {
    formData.append('autoCode', 'true');
  }
  return formData;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function downloadSampleExcel(filename, headers, rows) {
  const table = `
    <table>
      <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${headers.map((h) => `<td>${escapeHtml(row[h] || '')}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  const blob = new Blob([`<html><meta charset="utf-8"><body>${table}</body></html>`], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

document.getElementById('employeeSampleBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const headers = ['Name', 'Email', 'Employee Code', 'Role', 'Department'];
  downloadSampleExcel('employee-import-sample.xls', headers, [
    {
      Name: 'Amit Sharma',
      Email: 'amit.sharma@example.com',
      'Employee Code': 'EMP001',
      Role: 'employee',
      Department: 'Operations',
    },
  ]);
});

document.getElementById('holSampleBtn')?.addEventListener('click', async (e) => {
  e.stopPropagation();
  try {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch('/api/holidays/import/sample', { headers });
    if (!response.ok) {
      const headers = ['Holiday Name', 'Date', 'Type'];
      downloadSampleExcel('holiday-import-sample.xls', headers, [
        { 'Holiday Name': 'Republic Day', Date: '26/01/2026', Type: 'National Holiday' },
        { 'Holiday Name': 'Holi', Date: '14/03/2026', Type: 'Festival' },
        { 'Holiday Name': 'Optional leave day', Date: '15/08/2026', Type: 'Optional' },
      ]);
      return;
    }
    const blob = await response.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'holiday-import-sample.xlsx';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  } catch {
    HRMS.toast('Could not download sample file', 'error');
  }
});

document.getElementById('attendanceSampleBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const headers = ['Name', 'Employee Code', 'Date', 'Shift', 'InTime', 'OutTime', 'Work Dur.', 'OT', 'Tot. Dur.', 'Status'];
  downloadSampleExcel('attendance-import-sample.xls', headers, [
    {
      Name: 'Amit Sharma',
      'Employee Code': 'EMP001',
      Date: new Date().toISOString().slice(0, 10),
      Shift: 'General',
      InTime: '09:30',
      OutTime: '18:30',
      'Work Dur.': '09:00',
      OT: '00:00',
      'Tot. Dur.': '09:00',
      Status: 'Present',
    },
  ]);
});

document.getElementById('employeeImportFile')?.addEventListener('change', () => {
  employeeImportReady = false;
  const importBtn = document.getElementById('employeeImportBtn');
  if (importBtn) importBtn.disabled = true;
  document.getElementById('employeeImportPreview')?.classList.add('hidden');
  const file = selectedEmployeeImportFile();
  const fileName = document.getElementById('employeeImportFileName');
  if (fileName) fileName.textContent = file ? `Selected: ${file.name}` : 'No file selected.';
  const msg = document.getElementById('employeeImportMessage');
  if (msg) msg.textContent = '';
});

document.getElementById('employeePreviewBtn')?.addEventListener('click', async () => {
  const file = selectedEmployeeImportFile();
  const msg = document.getElementById('employeeImportMessage');
  const preview = document.getElementById('employeeImportPreview');
  const summary = document.getElementById('employeeImportPreviewSummary');
  const body = document.getElementById('employeeImportPreviewBody');
  const importBtn = document.getElementById('employeeImportBtn');
  if (!file) {
    HRMS.toast('Choose a file first', 'error');
    return;
  }
  try {
    const result = await api('/api/admin/import-employees/preview', {
      method: 'POST',
      body: employeeImportFormData(file),
    });
    employeeImportReady = true;
    if (msg) msg.textContent = '';
    if (summary) {
      summary.textContent = `${result.totalrows} row(s): ${result.newCount ?? 0} new, ${result.existingCount ?? 0} already in HRMS, ${result.invalidCount ?? 0} invalid. Showing up to 50 rows.`;
    }
    if (body) {
      body.innerHTML = (result.preview || [])
        .map((row) => `
          <tr>
            <td>${escapeHtml(row.status)}${row.issues ? ` — ${escapeHtml(row.issues)}` : ''}</td>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.email)}</td>
            <td>${escapeHtml(row.role)}</td>
            <td>${escapeHtml(row.employeecode)}</td>
          </tr>`)
        .join('');
    }
    preview?.classList.remove('hidden');
    if (importBtn) importBtn.disabled = false;
    HRMS.toast('Preview ready', 'success');
    importBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    employeeImportReady = false;
    preview?.classList.add('hidden');
    if (importBtn) importBtn.disabled = true;
    if (msg) msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});

document.getElementById('employeeImportBtn')?.addEventListener('click', async () => {
  const fileInput = document.getElementById('employeeImportFile');
  const msg = document.getElementById('employeeImportMessage');
  if (!fileInput.files.length) {
    HRMS.toast('Choose a file first', 'error');
    return;
  }
  if (!employeeImportReady) {
    HRMS.toast('Preview the file before importing', 'error');
    return;
  }
  try {
    const result = await api('/api/admin/import-employees', {
      method: 'POST',
      body: employeeImportFormData(fileInput.files[0]),
    });
    const skipped = result.skipped || 0;
    const updated = result.updated || 0;
    const failed = result.failedrows || 0;
    const imported = result.successfulimports || 0;
    const toastType = failed ? 'warning' : 'success';
    HRMS.toast(
      `${imported} new, ${updated} updated, ${skipped} skipped, ${failed} failed`,
      toastType
    );
    msg.style.whiteSpace = 'pre-wrap';
    msg.textContent = `${imported} new, ${updated} updated, ${skipped} skipped (already in HRMS), ${failed} failed`;
    if (result.errors?.length) {
      const lines = result.errors.slice(0, 10).map((e) => `Row ${e.row}: ${e.error}`);
      msg.textContent += `\n${lines.join('\n')}${result.errors.length > 10 ? '\n…' : ''}`;
    }
    employeeImportReady = false;
    const importBtn = document.getElementById('employeeImportBtn');
    if (importBtn) importBtn.disabled = true;
    document.getElementById('employeeImportPreview')?.classList.add('hidden');
    fileInput.value = '';
    const fileName = document.getElementById('employeeImportFileName');
    if (fileName) fileName.textContent = 'No file selected.';
    await loadEmployees();
    await loadAdminStats();
  } catch (error) {
    msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});

function mondayIndexFromJsDay(jsDay) {
  return (jsDay + 6) % 7;
}

const saturdayAdmin = { entriesMap: new Map() };

function syncSaturdayViewModeFields() {
  const mode = document.getElementById('satViewMode')?.value || 'month';
  document.querySelectorAll('.sat-month-fields').forEach((el) => {
    el.style.display = mode === 'month' ? '' : 'none';
  });
}

function renderSatMonthGrid(year, month, map) {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const labelEl = document.getElementById('satWeekdayLabels');
  const grid = document.getElementById('satMonthGrid');
  if (!labelEl || !grid) return;
  labelEl.innerHTML = labels.map((l) => `<div style="padding:6px 0;">${l}</div>`).join('');
  grid.innerHTML = '';
  const first = new Date(year, month - 1, 1);
  const startPad = mondayIndexFromJsDay(first.getDay());
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let i = 0; i < startPad; i += 1) {
    const pad = document.createElement('div');
    pad.style.aspectRatio = '1';
    grid.appendChild(pad);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dow = new Date(year, month - 1, day).getDay();
    const cell = document.createElement('div');
    cell.style.aspectRatio = '1';
    cell.style.borderRadius = '8px';
    cell.style.border = '1px solid var(--border)';
    cell.style.display = 'flex';
    cell.style.flexDirection = 'column';
    cell.style.alignItems = 'center';
    cell.style.justifyContent = 'center';
    cell.style.fontSize = '12px';
    cell.style.cursor = 'default';
    cell.style.padding = '4px';
    if (dow === 6) {
      const st = map.get(dateStr) || 'off';
      cell.style.cursor = 'pointer';
      cell.style.background = st === 'working' ? 'rgba(34,197,94,0.18)' : 'rgba(120,120,120,0.1)';
      cell.style.borderColor = st === 'working' ? '#22c55e' : 'var(--border)';
      cell.title = `Saturday — ${st === 'working' ? 'Working' : 'Off'} (click to toggle)`;
      cell.innerHTML = `<strong>${day}</strong><span style="font-size:10px;margin-top:2px;">${st === 'working' ? 'Work' : 'Off'}</span>`;
      cell.addEventListener('click', async () => {
        try {
          const cur = map.get(dateStr) || 'off';
          const next = cur === 'working' ? 'off' : 'working';
          await api('/api/saturday-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries: [{ date: dateStr, status: next }] }),
          });
          map.set(dateStr, next);
          renderSatMonthGrid(year, month, map);
          HRMS.toast('Saturday saved', 'success');
        } catch (err) {
          HRMS.toast(err.message || 'Save failed', 'error');
        }
      });
    } else if (dow === 0) {
      cell.style.opacity = '0.35';
      cell.innerHTML = `<span>${day}</span>`;
      cell.title = 'Sunday';
    } else {
      cell.style.opacity = '0.55';
      cell.innerHTML = `<span>${day}</span>`;
    }
    grid.appendChild(cell);
  }
}

function renderSatYearList(entries) {
  const wrap = document.getElementById('satYearList');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const e of entries) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.borderRadius = '8px';
    btn.style.padding = '10px 12px';
    btn.style.border = '1px solid var(--border)';
    btn.style.cursor = 'pointer';
    const st = e.status || 'off';
    btn.style.background = st === 'working' ? 'rgba(34,197,94,0.18)' : 'var(--surface)';
    btn.style.borderColor = st === 'working' ? '#22c55e' : 'var(--border)';
    btn.textContent = `${e.date} · ${st === 'working' ? 'Working' : 'Off'}`;
    btn.addEventListener('click', async () => {
      try {
        const next = st === 'working' ? 'off' : 'working';
        await api('/api/saturday-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: [{ date: e.date, status: next }] }),
        });
        e.status = next;
        renderSatYearList(entries);
        HRMS.toast('Saturday saved', 'success');
      } catch (err) {
        HRMS.toast(err.message || 'Save failed', 'error');
      }
    });
    wrap.appendChild(btn);
  }
}

async function loadSaturdayAdminConfig() {
  const mode = document.getElementById('satViewMode')?.value || 'month';
  const y = Number(document.getElementById('satYear')?.value);
  const msg = document.getElementById('satMessage');
  if (msg) msg.textContent = '';
  if (!y || y < 2000 || y > 2100) {
    if (msg) msg.textContent = 'Enter a valid year (2000–2100).';
    return;
  }
  try {
    let path;
    if (mode === 'year') {
      path = `/api/saturday-config?year=${y}`;
    } else {
      const m = Number(document.getElementById('satMonth')?.value);
      if (!m || m < 1 || m > 12) {
        if (msg) msg.textContent = 'Enter month 1–12.';
        return;
      }
      path = `/api/saturday-config?month=${m}&year=${y}`;
    }
    const data = await api(path);
    const entries = data.entries || [];
    saturdayAdmin.entriesMap = new Map(entries.map((e) => [e.date, e.status]));
    if (mode === 'year') {
      document.getElementById('satMonthWrap')?.classList.add('hidden');
      document.getElementById('satYearWrap')?.classList.remove('hidden');
      renderSatYearList(entries);
    } else {
      document.getElementById('satYearWrap')?.classList.add('hidden');
      document.getElementById('satMonthWrap')?.classList.remove('hidden');
      const m = Number(document.getElementById('satMonth')?.value);
      renderSatMonthGrid(y, m, saturdayAdmin.entriesMap);
    }
  } catch (e) {
    if (msg) msg.textContent = e.message || 'Load failed';
    HRMS.toast(e.message || 'Load failed', 'error');
  }
}

let saturdayAdminListenersBound = false;
function initSaturdayAdminPanel() {
  syncSaturdayViewModeFields();
  const yEl = document.getElementById('satYear');
  const mEl = document.getElementById('satMonth');
  if (yEl && !yEl.value) yEl.value = String(new Date().getFullYear());
  if (mEl && !mEl.value) mEl.value = String(new Date().getMonth() + 1);
  if (!saturdayAdminListenersBound) {
    saturdayAdminListenersBound = true;
    document.getElementById('satViewMode')?.addEventListener('change', () => {
      syncSaturdayViewModeFields();
    });
    document.getElementById('satLoadBtn')?.addEventListener('click', () => {
      loadSaturdayAdminConfig().catch(() => {});
    });
  }
}

function escapeHolAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clearHolidayForm() {
  const idEl = document.getElementById('holEditId');
  if (idEl) idEl.value = '';
  const n = document.getElementById('holName');
  if (n) n.value = '';
  const d = document.getElementById('holDate');
  if (d) d.value = '';
  const t = document.getElementById('holType');
  if (t) t.value = 'national';
  const msg = document.getElementById('holMessage');
  if (msg) msg.textContent = '';
}

async function loadHolidayAdminList() {
  const y = Number(document.getElementById('holYear')?.value);
  const msg = document.getElementById('holMessage');
  if (msg) msg.textContent = '';
  if (!y || y < 2000 || y > 2100) {
    if (msg) msg.textContent = 'Enter a valid year (2000–2100).';
    return;
  }
  try {
    const data = await api(`/api/holidays?year=${y}`);
    const list = data.holidays || [];
    const tbody = document.getElementById('holTableBody');
    if (!tbody) return;
    tbody.innerHTML = list
      .map(
        (h) =>
          `<tr>
        <td>${escapeHolAttr(h.date)}</td>
        <td>${escapeHolAttr(h.holidayName)}</td>
        <td>${escapeHolAttr(h.type)}</td>
        <td>
          <button type="button" class="btn btn-sm btn-outline" data-hol-edit="${h.id}">Edit</button>
          <button type="button" class="btn btn-sm" data-hol-del="${h.id}">Delete</button>
        </td>
      </tr>`
      )
      .join('');
    tbody.querySelectorAll('[data-hol-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-hol-edit'));
        const row = list.find((x) => x.id === id);
        if (!row) return;
        const idEl = document.getElementById('holEditId');
        if (idEl) idEl.value = String(id);
        const ne = document.getElementById('holName');
        if (ne) ne.value = row.holidayName;
        const de = document.getElementById('holDate');
        if (de) de.value = row.date;
        const te = document.getElementById('holType');
        if (te) te.value = row.type;
      });
    });
    tbody.querySelectorAll('[data-hol-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        deleteHolidayById(Number(btn.getAttribute('data-hol-del')), loadHolidayAdminList);
      });
    });
  } catch (e) {
    if (msg) msg.textContent = e.message || 'Load failed';
    HRMS.toast(e.message || 'Load failed', 'error');
  }
}

let holidayAdminListenersBound = false;
let holidayImportReady = false;

function selectedHolidayImportFile() {
  return document.getElementById('holImportFile')?.files?.[0] || null;
}

function resetHolidayImportPreview(options = {}) {
  holidayImportReady = false;
  const importBtn = document.getElementById('holImportBtn');
  if (importBtn) importBtn.disabled = true;
  document.getElementById('holImportPreview')?.classList.add('hidden');
  const fileName = document.getElementById('holImportFileName');
  const file = selectedHolidayImportFile();
  if (fileName) fileName.textContent = file ? `Selected: ${file.name}` : 'No file selected.';
  if (!options.keepMessage) {
    const msg = document.getElementById('holImportMessage');
    if (msg) msg.textContent = '';
  }
}

function initHolidayAdminPanel() {
  const yEl = document.getElementById('holYear');
  if (yEl && !yEl.value) yEl.value = String(new Date().getFullYear());
  if (!holidayAdminListenersBound) {
    holidayAdminListenersBound = true;
    document.getElementById('holLoadBtn')?.addEventListener('click', () => {
      loadHolidayAdminList().catch(() => {});
    });
    document.getElementById('holClearBtn')?.addEventListener('click', () => clearHolidayForm());
    document.getElementById('holImportFile')?.addEventListener('change', resetHolidayImportPreview);
    document.getElementById('holPreviewBtn')?.addEventListener('click', async () => {
      const file = selectedHolidayImportFile();
      const msg = document.getElementById('holImportMessage');
      const preview = document.getElementById('holImportPreview');
      const body = document.getElementById('holImportPreviewBody');
      const summary = document.getElementById('holImportPreviewSummary');
      if (!file) {
        HRMS.toast('Choose a holiday Excel file first', 'error');
        return;
      }
      try {
        const result = await uploadHolidayFile('/api/holidays/import/preview', file);
        holidayImportReady = true;
        if (msg) msg.textContent = result.errors?.length ? `${result.errors.length} row(s) have errors and will fail.` : '';
        if (summary) summary.textContent = `${result.totalrows} row(s) found. Showing up to 100 rows.`;
        if (body) {
          body.innerHTML = (result.preview || [])
            .map((row) => `<tr><td>${escapeHolAttr(row.holidayName)}</td><td>${escapeHolAttr(row.date || 'Invalid date')}</td><td>${escapeHolAttr(row.type)}</td></tr>`)
            .join('');
        }
        preview?.classList.remove('hidden');
        const importBtn = document.getElementById('holImportBtn');
        if (importBtn) importBtn.disabled = false;
        HRMS.toast('Holiday preview ready', 'success');
        importBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (e) {
        resetHolidayImportPreview();
        if (msg) msg.textContent = e.message || 'Preview failed';
        HRMS.toast(e.message || 'Preview failed', 'error');
      }
    });
    document.getElementById('holImportBtn')?.addEventListener('click', async () => {
      const file = selectedHolidayImportFile();
      const msg = document.getElementById('holImportMessage');
      if (!file) {
        HRMS.toast('Choose a holiday Excel file first', 'error');
        return;
      }
      if (!holidayImportReady) {
        HRMS.toast('Preview the file before importing', 'error');
        return;
      }
      try {
        const result = await uploadHolidayFile('/api/holidays/import', file);
        if (msg) {
          msg.textContent = `${result.successfulimports} imported, ${result.failedrows} failed`;
          if (result.errors?.length) {
            msg.textContent += ` — ${result.errors.map((e) => `Row ${e.row}: ${e.error}`).join('; ')}`;
          }
        }
        HRMS.toast(`${result.successfulimports} holidays imported`, 'success');
        const input = document.getElementById('holImportFile');
        if (input) input.value = '';
        const fileName = document.getElementById('holImportFileName');
        if (fileName) fileName.textContent = 'No file selected.';
        resetHolidayImportPreview({ keepMessage: true });
        await loadHolidayAdminList();
      } catch (e) {
        if (msg) msg.textContent = e.message || 'Import failed';
        HRMS.toast(e.message || 'Import failed', 'error');
      }
    });
    document.getElementById('holSaveBtn')?.addEventListener('click', async () => {
      const msg = document.getElementById('holMessage');
      if (msg) msg.textContent = '';
      const editId = document.getElementById('holEditId')?.value;
      const holidayName = document.getElementById('holName')?.value.trim();
      const date = document.getElementById('holDate')?.value;
      const type = document.getElementById('holType')?.value;
      if (!holidayName || !date || !type) {
        if (msg) msg.textContent = 'Name, date, and type are required.';
        return;
      }
      try {
        if (editId) {
          await api(`/api/holidays/${editId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ holidayName, date, type }),
          });
        } else {
          await api('/api/holidays', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ holidayName, date, type }),
          });
        }
        HRMS.toast('Holiday saved', 'success');
        clearHolidayForm();
        await loadHolidayAdminList();
      } catch (e) {
        if (msg) msg.textContent = e.message || 'Save failed';
        HRMS.toast(e.message || 'Save failed', 'error');
      }
    });
  }
}

function prettyHolidayType(type) {
  if (type === 'national') return 'National Holiday';
  if (type === 'festival') return 'Festival';
  if (type === 'optional') return 'Optional';
  return type || 'Holiday';
}

function holidayTypeBadge(type) {
  const label = prettyHolidayType(type);
  const bg =
    type === 'national'
      ? 'rgba(37,99,235,0.14)'
      : type === 'festival'
        ? 'rgba(147,51,234,0.14)'
        : 'rgba(100,116,139,0.16)';
  const color = type === 'national' ? '#2563eb' : type === 'festival' ? '#9333ea' : '#64748b';
  return `<span class="badge" style="background:${bg};color:${color};">${escapeHolAttr(label)}</span>`;
}

async function loadPublicHolidayCalendar() {
  const y = Number(document.getElementById('holPublicYear')?.value);
  const msg = document.getElementById('holPublicMessage');
  const body = document.getElementById('holPublicTableBody');
  const actionsHead = document.getElementById('holPublicActionsHead');
  const allowRemove = canManageHolidays();
  if (actionsHead) actionsHead.style.display = allowRemove ? '' : 'none';
  if (msg) msg.textContent = '';
  if (!body) return;
  if (!y || y < 2000 || y > 2100) {
    if (msg) msg.textContent = 'Enter a valid year (2000-2100).';
    return;
  }
  try {
    const data = await api(`/api/holidays?year=${y}`);
    const holidays = data.holidays || [];
    const emptyColspan = allowRemove ? 4 : 3;
    const actionCell = (h) =>
      allowRemove
        ? `<td><button type="button" class="btn btn-outline btn-sm" data-hol-public-del="${h.id}">Remove</button></td>`
        : '';
    body.innerHTML = holidays.length
      ? holidays
          .map(
            (h) =>
              `<tr><td>${escapeHolAttr(h.date)}</td><td>${escapeHolAttr(h.holidayName)}</td><td>${holidayTypeBadge(h.type)}</td>${actionCell(h)}</tr>`
          )
          .join('')
      : `<tr><td colspan="${emptyColspan}" class="stat-sub" style="padding:16px;text-align:center;">No holidays found for this year.</td></tr>`;
    body.querySelectorAll('[data-hol-public-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        deleteHolidayById(Number(btn.getAttribute('data-hol-public-del')), loadPublicHolidayCalendar);
      });
    });
  } catch (e) {
    if (msg) msg.textContent = e.message || 'Could not load holiday calendar';
    HRMS.toast(e.message || 'Could not load holiday calendar', 'error');
  }
}

function mountTeamHubWhenReady(section) {
  if (!['my-tasks', 'org-chart', 'calendar'].includes(section)) return;
  const tryMount = (attempt) => {
    if (window.HRMS?.initTeamHubPanels) {
      window.HRMS.initTeamHubPanels();
      return;
    }
    if (attempt < 50) setTimeout(() => tryMount(attempt + 1), 80);
  };
  tryMount(0);
}

function hasPerm(moduleKey) {
  if (!PERMS) return true;
  if (PERMS.isSuperAdmin(user) || isFounderProfile(user)) return true;
  return PERMS.getPermissions(user).includes(moduleKey);
}

function canManageHolidays() {
  if (!PERMS) return true;
  if (PERMS.isSuperAdmin(user) || isFounderProfile(user)) return true;
  const p = PERMS.getPermissions(user);
  return (
    p.includes(PERMS.MODULE.HOLIDAY_CALENDAR) ||
    p.includes(PERMS.MODULE.SETTINGS)
  );
}

async function deleteHolidayById(id, onSuccess) {
  if (!window.confirm('Remove this holiday from the calendar?')) return;
  try {
    await api(`/api/holidays/${id}`, { method: 'DELETE' });
    HRMS.toast('Holiday removed', 'success');
    if (typeof onSuccess === 'function') await onSuccess();
  } catch (e) {
    HRMS.toast(e.message || 'Remove failed', 'error');
  }
}

function navigateToFirstAllowed() {
  const btn = [...document.querySelectorAll('.sidebar-nav [data-nav]')].find(
    (el) => el.style.display !== 'none' && PERMS?.canAccessSection(el.getAttribute('data-nav'), user)
  );
  if (btn) btn.click();
}

HRMS.initSidebar({
  canNavigate(section) {
    if (!PERMS) return true;
    return PERMS.canAccessSection(section, user);
  },
  onBlocked() {
    PERMS?.showNotAuthorized();
  },
  onNavigate(section) {
    if (section === 'manage-admins' && window.HRMS.initManageAdmins) {
      window.HRMS.initManageAdmins(api);
    }
    mountTeamHubWhenReady(section);
    if (section === 'system') {
      initSaturdayAdminPanel();
      initHolidayAdminPanel();
    }
    if (section === 'holiday-calendar') {
      const yEl = document.getElementById('holPublicYear');
      if (yEl && !yEl.value) yEl.value = String(new Date().getFullYear());
      loadPublicHolidayCalendar().catch(() => {});
    }
    if (section === 'roles') {
      loadRoleManagement().catch((e) => HRMS.toast(e.message, 'error'));
    }
    if (section === 'leave-entitlements') {
      loadLeaveEntitlements().catch((e) => HRMS.toast(e.message, 'error'));
    }
    if (section === 'org-chart') {
      window.HRMS?.refreshTeamHubPanels?.();
    }
    if (section === 'reports') {
      loadReportEmployeeFilter().catch(() => {});
      loadAdminReports().catch((e) => HRMS.toast(e.message, 'error'));
    }
    if (section === 'calendar') {
      window.HRMS?.mountAttendanceCalendar?.('#adminCalendarRoot');
    }
    if (section === 'biometric') {
      esslDateRangeInputs();
      loadEsslPunchList().catch(() => {});
    }
  },
});
HRMS.initNavbarClock('navbarClock');
HRMS.initProfileDropdown();
HRMS.initNotificationBell((path, opts) => api(path, opts || {}));
HRMS.initNavbarSearch(['employeesBody', 'dailyBody', 'importHistoryBody', 'adminLeavesBody']);

if (user.mustchangepassword) show('passwordChangeSection');

document.getElementById('notAuthorizedHomeBtn')?.addEventListener('click', () => {
  if (PERMS?.canAccessSection('dashboard', user)) {
    document.querySelector('.sidebar-nav [data-nav="dashboard"]')?.click();
  } else {
    navigateToFirstAllowed();
  }
});

async function initAdminRbac() {
  if (!PERMS) return;
  if (isFounderProfile(user)) {
    user = PERMS.persistAdminUser({
      isSuperAdmin: true,
      permissions: Object.values(PERMS.MODULE),
    });
  } else {
    try {
      user = await PERMS.refreshSession(api);
    } catch (e) {
      if (!PERMS.isSuperAdmin(user) && !(user.permissions || []).length) {
        logout();
        return;
      }
    }
  }
  PERMS.applySidebarPermissions(user);
  if (!PERMS.canAccessSection('dashboard', user)) {
    const dash = document.getElementById('view-dashboard');
    if (dash?.classList.contains('is-active')) {
      dash.classList.remove('is-active');
      navigateToFirstAllowed();
    }
  }
  if (PERMS.isSuperAdmin(user) && window.HRMS.initManageAdmins) {
    window.HRMS.initManageAdmins(api);
  }
}

function scheduleDataLoads() {
  const M = PERMS?.MODULE || {};
  const tasks = [];
  if (!PERMS || hasPerm(M.DASHBOARD_OVERVIEW)) {
    tasks.push(loadAdminStats(), loadAdminLeaveBalance(), loadAdminLeaveSummary());
    refreshBirthdayBanner().catch(() => {});
  }
  if (!PERMS || hasPerm(M.EMPLOYEE_MANAGEMENT)) tasks.push(loadEmployees());
  if (!PERMS || hasPerm(M.ROLE_MANAGEMENT)) tasks.push(loadRoleManagement());
  if (!PERMS || hasPerm(M.REPORTS_EXPORT)) {
    tasks.push(loadAdminReports(), loadReportEmployeeFilter());
  }
  if (!PERMS || hasPerm(M.ATTENDANCE)) tasks.push(loadAdminDailyAttendance());
  if (!PERMS || hasPerm(M.IMPORT_DATA)) tasks.push(loadImportHistory());
  if (!PERMS || hasPerm(M.LEAVE_MANAGEMENT)) {
    tasks.push(loadAdminLeaves(), loadLeaveEntitlements());
  }
  loadAdminProfileFromServer().catch(() => {});
  loadAdminMyRequests().catch(() => {});
  if (!PERMS || hasPerm(M.REQUEST_APPROVALS)) {
    loadAdminInboxRequests().catch(() => {});
    loadAdminAllRequests().catch(() => {});
  }
  Promise.all(tasks).catch(console.error);
}

initAdminRbac()
  .then(() => {
    initHolidayAdminPanel();
    scheduleDataLoads();
  })
  .catch(() => {
    initHolidayAdminPanel();
    scheduleDataLoads();
  });

function loadOfficeForm() {
  const o = HRMS.getOfficeLocation();
  const lat = document.getElementById('officeLat');
  const lng = document.getElementById('officeLng');
  const r = document.getElementById('officeRadius');
  if (lat) lat.value = String(o.lat);
  if (lng) lng.value = String(o.lng);
  if (r) r.value = String(o.radiusMeters);
}

document.getElementById('officeSaveBtn')?.addEventListener('click', () => {
  const lat = Number(document.getElementById('officeLat')?.value);
  const lng = Number(document.getElementById('officeLng')?.value);
  const radiusMeters = Number(document.getElementById('officeRadius')?.value);
  if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(radiusMeters)) {
    HRMS.toast('Enter valid numbers', 'error');
    return;
  }
  try {
    localStorage.setItem('office_location', JSON.stringify({ lat, lng, radiusMeters }));
    HRMS.toast('Office location saved', 'success');
  } catch (e) {
    HRMS.toast(e.message || 'Save failed', 'error');
  }
});

loadOfficeForm();
document.getElementById('holPublicLoadBtn')?.addEventListener('click', () => {
  loadPublicHolidayCalendar().catch(() => {});
});
HRMS.initPunchScreen({
  api,
  ids: {
    clock: 'adminPunchClock',
    date: 'adminPunchDate',
    pill: 'adminPunchPill',
    btn: 'adminPunchBtn',
    msg: 'adminPunchMsg'
  }
});
