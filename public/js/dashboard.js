const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

const todayCard = document.getElementById('todayCard');
const calendarEl = document.getElementById('calendar');
const logoutBtn = document.getElementById('logoutBtn');

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('employee');
  window.location.href = '/login';
});

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function statusBadge(status) {
  return `<span class="badge ${status || 'absent'}">${status || 'absent'}</span>`;
}

async function loadToday() {
  const response = await fetch('/api/attendance/today', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 401) {
    localStorage.clear();
    window.location.href = '/login';
    return;
  }

  const data = await response.json();
  const record = data.record || {};

  todayCard.innerHTML = `
    <div class="tile"><strong>Punch In</strong><br>${formatDateTime(record.punchin) || 'Not punched in yet'}</div>
    <div class="tile"><strong>Punch Out</strong><br>${formatDateTime(record.punchout) || 'Not punched out yet'}</div>
    <div class="tile"><strong>Total Hours</strong><br>${record.totalhours ?? '-'}</div>
    <div class="tile"><strong>Status</strong><br>${statusBadge(record.status)}</div>
  `;
}

async function loadCalendar() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [historyRes] = await Promise.all([
    fetch(`/api/attendance/history?month=${month}&year=${year}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
  ]);
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

  const { records } = await historyRes.json();
  const statusByDate = new Map(records.map((r) => [r.date, r.status || 'absent']));

  const daysInMonth = new Date(year, month, 0).getDate();
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

loadToday();
loadCalendar();
