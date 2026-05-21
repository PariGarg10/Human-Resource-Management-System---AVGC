const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('employee') || '{}');

function normalizeRole(role) {
  return String(role || '').toLowerCase().trim();
}

function showPanel(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

const userRole = normalizeRole(user.role);
if (!token || userRole !== 'manager') {
  window.location.href = '/login';
}

const passwordChangeRequired = Boolean(user.mustchangepassword);

document.getElementById('sidebarUserName').textContent = user.name || 'Manager';
document.getElementById('sidebarAvatar').textContent = (user.name || 'M').charAt(0).toUpperCase();
document.getElementById('navProfileEmail').textContent = user.email || '';
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

function isPendingStatus(status) {
  return String(status || '').toLowerCase() === 'pending';
}

async function resolveManagerEmployeeId() {
  if (user.id) return user.id;
  try {
    const { profile } = await api('/api/users/me');
    if (profile?.id) {
      user.id = profile.id;
      localStorage.setItem('employee', JSON.stringify({ ...user, id: profile.id }));
      return profile.id;
    }
  } catch (_e) {}
  return null;
}

async function api(path, opt = {}) {
  const headers = { ...(opt.headers || {}), Authorization: `Bearer ${token}` };
  const response = await fetch(path, {
    ...opt,
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    logout();
    throw new Error(data.message || 'Unauthorized');
  }
  if (response.status === 403) {
    if (data.requiresPasswordChange) {
      showPanel('mgrPasswordChangeSection');
      throw new Error(data.message || 'Password change required');
    }
    throw new Error(data.message || 'Forbidden');
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
    <div class="stat-card stat-success"><div class="stat-label">Full day</div><div class="stat-value">${data.todaysummary.present}</div></div>
    <div class="stat-card"><div class="stat-label">Half day</div><div class="stat-value">${data.todaysummary.halfday}</div></div>
    <div class="stat-card"><div class="stat-label">Leave</div><div class="stat-value">${data.todaysummary.leave}</div></div>
    <div class="stat-card stat-danger"><div class="stat-label">Absent</div><div class="stat-value">${data.todaysummary.absent}</div></div>
  `;

  const reportsCards = document.getElementById('reportsCards');
  const summaryCards = document.getElementById('summaryCards');
  if (reportsCards && summaryCards) reportsCards.innerHTML = summaryCards.innerHTML;

  const ctx = document.getElementById('managerDoughnut');
  if (ctx && window.Chart) {
    if (doughnutChart) doughnutChart.destroy();
    doughnutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Full day', 'Half day', 'Leave', 'Absent'],
        datasets: [
          {
            data: [
              data.todaysummary.present,
              data.todaysummary.halfday,
              data.todaysummary.leave,
              data.todaysummary.absent
            ],
            backgroundColor: ['#22c55e', '#eab308', '#eab308', '#ed1d24']
          }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }
}

async function loadManagerLeaveBalance() {
  const grid = document.getElementById('managerLeaveBalanceGrid');
  const summary = document.getElementById('managerLeaveBalanceSummary');
  if (!grid || !summary) return;
  const employeeId = await resolveManagerEmployeeId();
  if (!employeeId) {
    summary.textContent = 'Could not load leave balance';
    grid.innerHTML = '';
    return;
  }
  try {
    const data = await api(`/api/leave-balance/${employeeId}`);
    const totals = data.totals || { remaining: 0, total: 0, used: 0 };
    summary.textContent = `${totals.remaining} of ${totals.total} days remaining (${totals.used} used)`;
    grid.innerHTML = (data.balances || [])
      .map(
        (item) => `
    <div class="tile">
      <strong>${item.type}</strong>
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function prettyHolidayType(type) {
  if (type === 'national') return 'National Holiday';
  if (type === 'festival') return 'Festival';
  if (type === 'optional') return 'Optional';
  return type || 'Holiday';
}

function holidayTypeBadge(type) {
  const bg =
    type === 'national'
      ? 'rgba(37,99,235,0.14)'
      : type === 'festival'
        ? 'rgba(147,51,234,0.14)'
        : 'rgba(100,116,139,0.16)';
  const color = type === 'national' ? '#2563eb' : type === 'festival' ? '#9333ea' : '#64748b';
  return `<span class="badge" style="background:${bg};color:${color};">${escapeHtml(prettyHolidayType(type))}</span>`;
}

async function loadDailyAttendance() {
  const date = document.getElementById('managerDate').value;
  const data = await api(`/api/manager/attendance/daily?date=${date}`);
  const recs = data.records || [];
  const tbody = document.getElementById('dailyBody');
  if (!tbody) return;
  if (!recs.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="stat-sub" style="padding:24px;text-align:center;">No attendance rows for this date.</td></tr>';
    return;
  }
  tbody.innerHTML = recs
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
  const leaves = data.leaves || [];
  const tbody = document.getElementById('leaveBody');
  if (!tbody) return;
  if (!leaves.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="stat-sub" style="padding:24px;text-align:center;">No leave requests found.</td></tr>';
    return;
  }
  tbody.innerHTML = leaves
    .map(
      (leave) => `
    <tr>
      <td>${leave.name} (${leave.employeecode})</td>
      <td>${leave.leavetype}</td>
      <td>${leave.fromdate}</td>
      <td>${leave.todate}</td>
      <td>${HRMS.badge(leave.status)}</td>
      <td>${isPendingStatus(leave.status) ? `<button type="button" class="btn btn-primary btn-sm" data-leave-action="approve" data-leave-id="${leave.id}">Approve</button> <button type="button" class="btn btn-outline btn-sm" data-leave-action="reject" data-leave-id="${leave.id}">Reject</button>` : '—'}</td>
    </tr>`
    )
    .join('');
  tbody.querySelectorAll('[data-leave-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-leave-id');
      const action = btn.getAttribute('data-leave-action');
      try {
        await api(`/api/leaves/team/${id}/${action}`, { method: 'PUT' });
        HRMS.toast(action === 'approve' ? 'Leave approved' : 'Leave rejected', 'success');
        await Promise.all([loadLeaves(), loadSummary()]);
      } catch (e) {
        HRMS.toast(e.message || 'Leave action failed', 'error');
      }
    });
  });
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

function responseFormHtml(requestId) {
  return `
    <div style="min-width:260px;">
      <textarea data-req-response="${requestId}" rows="2" placeholder="Write response..." style="padding:8px;border-radius:8px;border:1px solid var(--border);width:100%;"></textarea>
      <input type="file" data-req-file="${requestId}" style="margin-top:6px;font-size:12px;width:100%;" />
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
        <button type="button" class="btn btn-primary btn-sm" data-req-reply="${requestId}">Respond</button>
        <button type="button" class="btn btn-outline btn-sm" data-req-close="${requestId}">Respond & Close</button>
      </div>
    </div>`;
}

async function submitManagerRequest(e) {
  e.preventDefault();
  const msg = document.getElementById('mgrRequestMessage');
  if (msg) msg.textContent = '';
  try {
    await api('/api/concerns', { method: 'POST', body: requestFormData('mgr') });
    HRMS.toast('Request submitted', 'success');
    e.target.reset();
    await loadManagerMyRequests();
  } catch (err) {
    if (msg) msg.textContent = err.message;
    HRMS.toast(err.message || 'Could not submit request', 'error');
  }
}

async function loadManagerMyRequests() {
  const data = await api('/api/concerns/my');
  const body = document.getElementById('mgrMyRequestsBody');
  if (!body) return;
  const rows = data.concerns || [];
  body.innerHTML = rows.length
    ? rows.map((r) => `<tr><td>${escapeHtml(r.subject)}</td><td>${escapeHtml(r.raisedToName || '—')}</td><td>${escapeHtml(r.priority)}</td><td>${requestStatusBadge(r.status)}</td><td>${responseSummary(r)}</td></tr>`).join('')
    : requestRowsEmpty(5);
}

async function respondToManagerRequest(id, close) {
  const responseEl = document.querySelector(`[data-req-response="${id}"]`);
  const fileEl = document.querySelector(`[data-req-file="${id}"]`);
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

async function loadManagerInboxRequests() {
  const data = await api('/api/concerns/inbox');
  const body = document.getElementById('mgrInboxRequestsBody');
  if (!body) return;
  const rows = data.concerns || [];
  body.innerHTML = rows.length
    ? rows.map((r) => `<tr><td>${escapeHtml(r.raisedByName || '—')}</td><td>${escapeHtml(r.subject)}</td><td>${escapeHtml(r.priority)}</td><td>${requestStatusBadge(r.status)}</td><td>${r.status !== 'Closed' ? responseFormHtml(r.id) : responseSummary(r)}</td></tr>`).join('')
    : requestRowsEmpty(5);
  body.querySelectorAll('[data-req-reply]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await respondToManagerRequest(btn.getAttribute('data-req-reply'), false);
        await loadManagerInboxRequests();
      } catch (e) {
        HRMS.toast(e.message || 'Could not respond', 'error');
      }
    });
  });
  body.querySelectorAll('[data-req-close]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await respondToManagerRequest(btn.getAttribute('data-req-close'), true);
        await loadManagerInboxRequests();
      } catch (e) {
        HRMS.toast(e.message || 'Could not close request', 'error');
      }
    });
  });
}

async function loadEmployees() {
  const data = await api('/api/manager/employees');
  const emps = data.employees || [];
  const tbody = document.getElementById('employeesBody');
  if (!tbody) return;
  if (!emps.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="stat-sub" style="padding:24px;text-align:center;">No assignments found.</td></tr>';
    return;
  }
  tbody.innerHTML = emps
    .map(
      (e) => `
    <tr><td>${e.employeecode}</td><td>${e.name}</td><td>${e.email}</td><td>${e.department || '—'}</td></tr>`
    )
    .join('');
}

async function loadTeamSummary() {
  const month = document.getElementById('tmMonth').value;
  const year = document.getElementById('tmYear').value;
  const [data, holidayData] = await Promise.all([
    api(`/api/manager/team-summary?month=${month}&year=${year}`),
    api(`/api/holidays?month=${month}&year=${year}`)
  ]);
  const rows = data.rows || [];
  const holidays = holidayData.holidays || [];
  const tbody = document.getElementById('teamSummaryBody');
  if (tbody) {
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="stat-sub" style="padding:24px;text-align:center;">No assignments found for this month.</td></tr>';
    } else {
      tbody.innerHTML = rows
        .map(
          (r) => `
    <tr>
      <td>${r.name}</td>
      <td>${r.presentdays ?? 0}</td>
      <td>${r.halfdays ?? 0}</td>
      <td>${r.leavedays ?? 0}</td>
      <td>${r.absentdays ?? 0}</td>
      <td>${holidays.length}</td>
    </tr>`
        )
        .join('');
    }
  }

  const holBody = document.getElementById('managerHolidayBody');
  if (holBody) {
    holBody.innerHTML = holidays.length
      ? holidays
          .map((h) => `<tr><td>${escapeHtml(h.date)}</td><td>${escapeHtml(h.holidayName)}</td><td>${holidayTypeBadge(h.type)}</td></tr>`)
          .join('')
      : '<tr><td colspan="3" class="stat-sub" style="padding:16px;text-align:center;">No holidays this month.</td></tr>';
  }

  const ctx = document.getElementById('managerBarChart');
  if (ctx && window.Chart) {
    if (barChart) barChart.destroy();
    barChart = null;
    if (rows.length) {
      const top = rows.slice(0, 8);
      barChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: top.map((r) => r.name.split(' ')[0]),
          datasets: [
            { label: 'Present', data: top.map((r) => r.presentdays || 0), backgroundColor: '#22c55e' },
            { label: 'Absent', data: top.map((r) => r.absentdays || 0), backgroundColor: '#ed1d24' }
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
}

document.getElementById('mgrChangePasswordForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('mgrPasswordChangeMessage');
  if (msg) msg.textContent = '';
  try {
    await api('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: document.getElementById('mgrCurrentPassword').value,
        newPassword: document.getElementById('mgrNewPassword').value
      })
    });
    HRMS.toast('Password updated. Please sign in again.', 'success');
    setTimeout(logout, 900);
  } catch (error) {
    if (msg) msg.textContent = error.message;
    HRMS.toast(error.message, 'error');
  }
});

document.getElementById('loadDailyBtn').addEventListener('click', () => {
  Promise.all([loadSummary(), loadDailyAttendance(), loadLeaves()]).catch((e) => HRMS.toast(e.message, 'error'));
});

document.getElementById('loadTeamSummaryBtn').addEventListener('click', () => {
  loadTeamSummary().catch((e) => HRMS.toast(e.message, 'error'));
});
document.querySelectorAll('[data-nav-jump]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const section = btn.getAttribute('data-nav-jump');
    const navBtn = document.querySelector(`.sidebar-nav [data-nav="${section}"]`);
    if (navBtn) navBtn.click();
  });
});

document.getElementById('mgrLeaveForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('mgrLeaveMessage');
  if (msg) msg.textContent = '';
  try {
    await api('/api/leaves/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leavetype: document.getElementById('mgrLeaveType').value,
        fromdate: document.getElementById('mgrLeaveFrom').value,
        todate: document.getElementById('mgrLeaveTo').value,
        reason: document.getElementById('mgrLeaveReason').value.trim()
      })
    });
    HRMS.toast('Leave request submitted', 'success');
    e.target.reset();
    await loadManagerLeaveBalance();
  } catch (err) {
    if (msg) msg.textContent = err.message;
    HRMS.toast(err.message || 'Could not submit leave', 'error');
  }
});

document.getElementById('mgrRequestForm')?.addEventListener('submit', submitManagerRequest);
document.getElementById('loadMgrMyRequestsBtn')?.addEventListener('click', () => {
  loadManagerMyRequests().catch((e) => HRMS.toast(e.message, 'error'));
});
document.getElementById('loadMgrInboxRequestsBtn')?.addEventListener('click', () => {
  loadManagerInboxRequests().catch((e) => HRMS.toast(e.message, 'error'));
});

async function loadManagerHolidayCalendar() {
  const year = document.getElementById('mgrHolYear')?.value || new Date().getFullYear();
  const data = await api(`/api/holidays?year=${year}`);
  const body = document.getElementById('mgrHolidayCalendarBody');
  if (!body) return;
  const holidays = data.holidays || [];
  body.innerHTML = holidays.length
    ? holidays
        .map((h) => `<tr><td>${escapeHtml(h.date)}</td><td>${escapeHtml(h.holidayName)}</td><td>${holidayTypeBadge(h.type)}</td></tr>`)
        .join('')
    : '<tr><td colspan="3" class="stat-sub" style="padding:16px;text-align:center;">No holidays found for this year.</td></tr>';
}

document.getElementById('loadMgrHolidaysBtn')?.addEventListener('click', () => {
  loadManagerHolidayCalendar().catch((e) => HRMS.toast(e.message, 'error'));
});

function applyMgrProfileToForm(profile) {
  if (!profile) return;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v != null ? String(v) : '';
  };
  set('mgrProfileName', profile.name || '');
  set('mgrProfileEmail', profile.email || '');
  set('mgrProfilePhone', profile.phone || '');
  set('mgrProfileLocation', profile.location || '');
  set('mgrProfileBio', profile.bio || '');
  set('mgrProfileDob', profile.dateOfBirth || '');
  const initEl = document.getElementById('mgrProfilePhotoInitial');
  const img = document.getElementById('mgrProfilePhotoPreview');
  if (img && initEl) {
    if (profile.profilePhotoUrl) {
      img.src = profile.profilePhotoUrl;
      img.classList.remove('hidden');
      initEl.classList.add('hidden');
    } else {
      img.classList.add('hidden');
      initEl.classList.remove('hidden');
      initEl.textContent = (profile.name || '?').charAt(0).toUpperCase();
    }
  }
}

async function loadMgrProfileFromServer() {
  try {
    const { profile } = await api('/api/users/me');
    applyMgrProfileToForm(profile);
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
    document.getElementById('sidebarUserName').textContent = profile.name || 'Manager';
    const mph = document.getElementById('mgrProfileHeading');
    if (mph) mph.textContent = profile.name || 'Profile';
    const side = document.getElementById('sidebarAvatar');
    if (side && profile.profilePhotoUrl) {
      side.innerHTML =
        '<img class="sidebar-avatar-img" src="' +
        profile.profilePhotoUrl +
        '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />';
    } else if (side) {
      side.textContent = (profile.name || 'M').charAt(0).toUpperCase();
    }
    const navImg = document.getElementById('navAvatar');
    if (navImg && profile.profilePhotoUrl) {
      navImg.src = profile.profilePhotoUrl + '?t=' + Date.now();
      navImg.classList.remove('hidden');
    } else if (navImg) {
      navImg.classList.add('hidden');
    }
    document.getElementById('profileDept').textContent = profile.department || '—';
    document.getElementById('profileCode').textContent = profile.employeecode || '—';
  } catch (_e) {}
}

async function refreshMgrBirthdayBanner() {
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

document.getElementById('mgrProfilePhoto')?.addEventListener('change', (e) => {
  const err = document.getElementById('mgrProfilePhotoErr');
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
  const img = document.getElementById('mgrProfilePhotoPreview');
  const initEl = document.getElementById('mgrProfilePhotoInitial');
  if (img && initEl) {
    img.src = url;
    img.classList.remove('hidden');
    initEl.classList.add('hidden');
  }
  HRMS.updateAvatarEverywhere(url);
});

document.getElementById('mgrProfileForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('mgrProfileMessage');
  if (msg) msg.textContent = '';
  try {
    const fd = new FormData();
    fd.append('name', document.getElementById('mgrProfileName').value.trim());
    fd.append('phone', document.getElementById('mgrProfilePhone').value.trim());
    fd.append('location', document.getElementById('mgrProfileLocation').value.trim());
    fd.append('bio', document.getElementById('mgrProfileBio').value.trim());
    fd.append('dateOfBirth', document.getElementById('mgrProfileDob').value.trim());
    const file = document.getElementById('mgrProfilePhoto').files[0];
    if (file) fd.append('profilePhoto', file);
    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Save failed');
    HRMS.toast('Profile saved successfully ✓', 'success');
    if (data.profile && data.profile.profilePhotoUrl) {
      HRMS.updateAvatarEverywhere(data.profile.profilePhotoUrl);
    }
    try {
      localStorage.setItem(
        'user_profile',
        JSON.stringify({
          name: data.profile?.name || document.getElementById('mgrProfileName').value.trim(),
          profilePhotoUrl: data.profile?.profilePhotoUrl || null
        })
      );
    } catch (_e) {}
    HRMS.syncNavProfileName(
      data.profile?.name || document.getElementById('mgrProfileName').value.trim(),
      data.profile?.email || ''
    );
    await loadMgrProfileFromServer();
  } catch (err) {
    if (msg) msg.textContent = err.message;
    HRMS.toast(err.message, 'error');
  }
});

HRMS.initNotificationBell((path, opts) => api(path, opts || {}));
function mountTeamHubWhenReady(section) {
  if (!['my-tasks', 'teams', 'org-chart'].includes(section)) return;
  const tryMount = (attempt) => {
    if (window.HRMS?.initTeamHubPanels) {
      window.HRMS.initTeamHubPanels();
      return;
    }
    if (attempt < 50) setTimeout(() => tryMount(attempt + 1), 80);
  };
  tryMount(0);
}

function onManagerNavigate(section) {
  mountTeamHubWhenReady(section);
  if (section === 'employees') loadEmployees().catch((e) => HRMS.toast(e.message, 'error'));
  if (section === 'team-attendance' || section === 'dashboard') {
    Promise.all([loadSummary(), loadDailyAttendance()]).catch((e) => HRMS.toast(e.message, 'error'));
  }
  if (section === 'leaves' || section === 'dashboard') {
    loadLeaves().catch((e) => HRMS.toast(e.message, 'error'));
  }
  if (section === 'team-calendar') loadTeamSummary().catch((e) => HRMS.toast(e.message, 'error'));
  if (section === 'holiday-calendar') loadManagerHolidayCalendar().catch((e) => HRMS.toast(e.message, 'error'));
  if (section === 'requests-my') loadManagerMyRequests().catch((e) => HRMS.toast(e.message, 'error'));
  if (section === 'requests-inbox') loadManagerInboxRequests().catch((e) => HRMS.toast(e.message, 'error'));
  if (section === 'requests-raise') {
    const msg = document.getElementById('mgrRequestMessage');
    if (msg) msg.textContent = '';
  }
  if (section === 'dashboard') loadManagerLeaveBalance().catch(() => {});
}

HRMS.initSidebar({ onNavigate: onManagerNavigate });
HRMS.initNavbarClock('navbarClock');
HRMS.initProfileDropdown();

const mgrHolYear = document.getElementById('mgrHolYear');
if (mgrHolYear && !mgrHolYear.value) mgrHolYear.value = String(new Date().getFullYear());

if (passwordChangeRequired) {
  showPanel('mgrPasswordChangeSection');
} else {
  loadMgrProfileFromServer().catch(() => {});
  refreshMgrBirthdayBanner().catch(() => {});
  loadManagerLeaveBalance().catch(() => {});
  loadManagerMyRequests().catch(() => {});
  loadManagerInboxRequests().catch(() => {});
  Promise.all([
    loadSummary(),
    loadDailyAttendance(),
    loadLeaves(),
    loadEmployees(),
    loadTeamSummary()
  ]).catch((e) => HRMS.toast(e.message || 'Could not load dashboard', 'error'));
}

HRMS.initPunchScreen({
  api,
  ids: { clock: 'mgrPunchClock', date: 'mgrPunchDate', pill: 'mgrPunchPill', btn: 'mgrPunchBtn', msg: 'mgrPunchMsg' }
});
HRMS.renderLeadershipSection('mgrLeadershipHost');
mountTeamHubWhenReady('org-chart');
