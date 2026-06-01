/**
 * Standalone page: /admin/manager-assignments
 * (Dashboard uses admin-people-modules.js in-page instead.)
 */
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('employee') || '{}');
if (!token || user.role !== 'admin') {
  window.location.href = '/login';
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    localStorage.clear();
    window.location.href = '/login';
    throw new Error(data.message || 'Unauthorized');
  }
  if (response.status === 403 && data.requiresPasswordChange) {
    window.location.href = '/admin/dashboard';
    throw new Error(data.message || 'Password change required');
  }
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.clear();
  window.location.href = '/login';
});

if (window.HRMS?.initManagerAssignments) {
  HRMS.initManagerAssignments(api, document.getElementById('view-manager-assignments'));
}
