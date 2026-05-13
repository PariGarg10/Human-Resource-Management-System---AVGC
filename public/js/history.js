const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

const monthEl = document.getElementById('month');
const yearEl = document.getElementById('year');
const loadBtn = document.getElementById('loadBtn');
const historyBody = document.getElementById('historyBody');
const summaryEl = document.getElementById('summary');
const logoutBtn = document.getElementById('logoutBtn');

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('employee');
  window.location.href = '/login';
});

const now = new Date();
monthEl.value = now.getMonth() + 1;
yearEl.value = now.getFullYear();

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function rowTemplate(record) {
  return `
    <tr>
      <td>${record.date}</td>
      <td>${formatDateTime(record.punchin)}</td>
      <td>${formatDateTime(record.punchout)}</td>
      <td>${record.totalhours ?? '-'}</td>
      <td><span class="badge ${record.status || 'absent'}">${record.status || 'absent'}</span></td>
    </tr>
  `;
}

async function loadHistory() {
  const month = Number(monthEl.value);
  const year = Number(yearEl.value);

  const [historyRes, summaryRes] = await Promise.all([
    fetch(`/api/attendance/history?month=${month}&year=${year}`, {
      headers: { Authorization: `Bearer ${token}` }
    }),
    fetch(`/api/attendance/summary?month=${month}&year=${year}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
  ]);

  if (historyRes.status === 401 || summaryRes.status === 401) {
    localStorage.clear();
    window.location.href = '/login';
    return;
  }

  const historyData = await historyRes.json();
  const summaryData = await summaryRes.json();

  historyBody.innerHTML = historyData.records.map(rowTemplate).join('');
  summaryEl.textContent = `Present: ${summaryData.present} | Half Days: ${summaryData.halfday} | Absent: ${summaryData.absent}`;
}

loadBtn.addEventListener('click', loadHistory);
loadHistory();
