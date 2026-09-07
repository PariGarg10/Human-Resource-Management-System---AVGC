/**
 * End-to-end smoke test for major HRMS API flows.
 * Usage: npm run test:smoke
 * Requires: server running (npm run dev), PostgreSQL, super admin credentials.
 */
require('dotenv').config();
const {
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
} = require('../constants/superAdmin');
const { buildWorkLogImportTemplateBuffer } = require('../utils/efficiencyWorkLogImport');
const { buildImportTemplateBuffer } = require('../utils/efficiencyProjectImport');
const { buildSampleWorkbookBuffer } = require('../utils/holidayImport');

const BASE = (process.env.SMOKE_TEST_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const today = new Date().toISOString().slice(0, 10);

const results = [];

function record(category, name, ok, detail = '') {
  results.push({ category, name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  const extra = detail ? ` — ${detail}` : '';
  console.log(`  [${mark}] ${name}${extra}`);
}

async function request(method, path, { token, body, expectStatuses = [200] } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  const ok = expectStatuses.includes(res.status);
  return { ok, status: res.status, json, text };
}

async function login(email, password) {
  const res = await request('POST', '/api/auth/login', {
    body: { email, password },
    expectStatuses: [200],
  });
  if (!res.ok) {
    return { ok: false, detail: res.json.message || `HTTP ${res.status}` };
  }
  return { ok: true, token: res.json.token, user: res.json.employee || res.json.user };
}

async function testHealth() {
  console.log('\n=== Infrastructure ===');
  try {
    const res = await fetch(`${BASE}/health`);
    const json = await res.json().catch(() => ({}));
    record('infra', 'Server /health', res.ok, json.status || `HTTP ${res.status}`);
  } catch (err) {
    record('infra', 'Server /health', false, err.message);
  }

  try {
    buildWorkLogImportTemplateBuffer();
    record('infra', 'Work log import template builds', true);
  } catch (err) {
    record('infra', 'Work log import template builds', false, err.message);
  }

  try {
    buildImportTemplateBuffer();
    record('infra', 'Efficiency project template builds', true);
  } catch (err) {
    record('infra', 'Efficiency project template builds', false, err.message);
  }

  try {
    buildSampleWorkbookBuffer();
    record('infra', 'Holiday import sample builds', true);
  } catch (err) {
    record('infra', 'Holiday import sample builds', false, err.message);
  }
}

async function testAuth(adminToken) {
  console.log('\n=== Auth ===');
  const me = await request('GET', '/api/auth/me', { token: adminToken });
  record('auth', 'GET /api/auth/me (admin)', me.ok, me.json.email || me.json.message);

  const bad = await request('POST', '/api/auth/login', {
    body: { email: 'invalid@example.com', password: 'wrong' },
    expectStatuses: [401],
  });
  record('auth', 'Invalid login rejected', bad.ok);
}

async function testAdminCore(token) {
  console.log('\n=== Admin — core ===');
  const endpoints = [
    ['GET /api/admin/session', '/api/admin/session'],
    ['GET /api/admin/employees', '/api/admin/employees'],
    ['GET /api/admin/upcoming-birthdays', '/api/admin/upcoming-birthdays'],
    ['GET /api/admin/attendance/daily', `/api/admin/attendance/daily?date=${today}`],
    ['GET /api/admin/attendance/regularization', '/api/admin/attendance/regularization'],
    ['GET /api/admin/leaves', '/api/admin/leaves'],
    ['GET /api/admin/leave-entitlements', '/api/admin/leave-entitlements'],
    ['GET /api/admin/manager-assignments', '/api/admin/manager-assignments'],
    ['GET /api/admin/import-history', '/api/admin/import-history'],
    ['GET /api/admin/reports', `/api/admin/reports?from=${today}&to=${today}`],
  ];
  for (const [name, path] of endpoints) {
    const res = await request('GET', path, { token });
    record('admin', name, res.ok, res.ok ? '' : res.json.message || `HTTP ${res.status}`);
  }
}

async function testAttendance(token, userId) {
  console.log('\n=== Attendance ===');
  const month = today.slice(5, 7);
  const year = today.slice(0, 4);
  for (const [name, path] of [
    ['GET /api/attendance/today', '/api/attendance/today'],
    ['GET /api/attendance/history', `/api/attendance/history?month=${month}&year=${year}`],
    ['GET /api/attendance/summary', `/api/attendance/summary?month=${month}&year=${year}`],
    ['GET /api/attendance/regularization/mine', '/api/attendance/regularization/mine'],
  ]) {
    const res = await request('GET', path, { token });
    record('attendance', name, res.ok, res.ok ? '' : res.json.message || `HTTP ${res.status}`);
  }
}

async function testExit(token) {
  console.log('\n=== Exit formalities ===');
  for (const [name, path] of [
    ['GET /api/exit/my', '/api/exit/my'],
    ['GET /api/exit/admin/requests', '/api/exit/admin/requests'],
    ['GET /api/exit/admin/pending?type=it', '/api/exit/admin/pending?type=it'],
    ['GET /api/exit/admin/pending?type=finance', '/api/exit/admin/pending?type=finance'],
    ['GET /api/exit/admin/all', '/api/exit/admin/all'],
    ['GET /api/exit/admin/documents', '/api/exit/admin/documents'],
  ]) {
    const res = await request('GET', path, { token });
    record('exit', name, res.ok, res.ok ? '' : res.json.message || `HTTP ${res.status}`);
  }

  const zipEmpty = await request('POST', '/api/exit/admin/documents/zip', {
    token,
    body: { exitRequestIds: [] },
    expectStatuses: [400],
  });
  record('exit', 'POST documents/zip validates empty selection', zipEmpty.ok);
}

async function testEfficiency(token) {
  console.log('\n=== Efficiency ===');
  const projects = await request('GET', '/api/efficiency-projects', { token });
  record('efficiency', 'GET /api/efficiency-projects', projects.ok);

  const report = await request('GET', `/api/efficiency?period=month&date=${today}`, { token });
  record('efficiency', 'GET /api/efficiency report', report.ok, report.ok ? '' : report.json.message);

  const daily = await request('GET', `/api/efficiency/daily-inputs?date=${today}`, { token });
  record('efficiency', 'GET /api/efficiency/daily-inputs', daily.ok);

  const wlTpl = await fetch(`${BASE}/api/efficiency/work-logs/import-template`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  record(
    'efficiency',
    'GET work-logs import template',
    wlTpl.ok,
    wlTpl.ok ? `${wlTpl.headers.get('content-length') || '?'} bytes` : `HTTP ${wlTpl.status}`
  );

  const projTpl = await fetch(`${BASE}/api/efficiency-projects/import-template`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  record('efficiency', 'GET projects import template', projTpl.ok, projTpl.ok ? '' : `HTTP ${projTpl.status}`);

  const projectId = projects.json?.projects?.[0]?.id;
  if (projectId) {
    const baselines = await request('GET', `/api/task-baselines/${projectId}`, { token });
    record('efficiency', 'GET /api/task-baselines/:projectId', baselines.ok);
  } else {
    record('efficiency', 'GET /api/task-baselines/:projectId', true, 'skipped — no projects');
  }
}

async function testAssets(token) {
  console.log('\n=== Assets ===');
  for (const [name, path] of [
    ['GET /api/assets/inventory', '/api/assets/inventory'],
    ['GET /api/assets/allocations', '/api/assets/allocations'],
    ['GET /api/assets/my-allocations', '/api/assets/my-allocations'],
    ['GET /api/assets/employees-options', '/api/assets/employees-options'],
  ]) {
    const res = await request('GET', path, { token });
    record('assets', name, res.ok, res.ok ? '' : res.json.message || `HTTP ${res.status}`);
  }
}

async function testEmployeeDocs(token) {
  console.log('\n=== Employee documents ===');
  const overview = await request('GET', '/api/employee-documents/admin/overview', { token });
  record('documents', 'GET admin/overview', overview.ok);

  const employeeId = overview.json?.employees?.[0]?.id;
  if (employeeId) {
    const docs = await request('GET', `/api/employee-documents/admin/employee/${employeeId}`, { token });
    record('documents', 'GET admin/employee/:id', docs.ok);
  } else {
    record('documents', 'GET admin/employee/:id', true, 'skipped — no employees');
  }

  const zipEmpty = await request('POST', '/api/employee-documents/admin/zip', {
    token,
    body: { documentIds: [] },
    expectStatuses: [400],
  });
  record('documents', 'POST admin/zip validates empty selection', zipEmpty.ok);
}

async function testOtherModules(token, userId) {
  console.log('\n=== Other modules ===');
  const year = today.slice(0, 4);
  const endpoints = [
    ['holidays', 'GET /api/holidays', `/api/holidays?year=${year}`],
    ['holidays', 'GET /api/holidays/import/sample', '/api/holidays/import/sample'],
    ['leave', 'GET /api/leave/my-leaves', '/api/leave/my-leaves'],
    ['leave-balance', 'GET /api/leave-balance/:id', `/api/leave-balance/${userId}`],
    ['performance', 'GET /api/performance/meta', '/api/performance/meta'],
    ['performance', 'GET /api/performance/admin/overview', '/api/performance/admin/overview'],
    ['policies', 'GET /api/policies', '/api/policies'],
    ['onboarding', 'GET /api/onboarding/admin/summary', '/api/onboarding/admin/summary'],
    ['notifications', 'GET /api/notifications', '/api/notifications'],
    ['dashboard', 'GET /api/dashboard/home', '/api/dashboard/home'],
    ['org', 'GET /api/org-chart/focused/:id', `/api/org-chart/focused/${userId}`],
    ['home', 'GET /api/home-recognition', '/api/home-recognition'],
    ['live', 'GET /api/live-activities/links', '/api/live-activities/links'],
    ['social', 'GET /api/social-posts', '/api/social-posts'],
    ['saturday', 'GET /api/saturday-config', `/api/saturday-config?from=${today}&to=${today}`],
    ['admin-accounts', 'GET /api/admin/accounts/modules', '/api/admin/accounts/modules'],
  ];
  for (const [category, name, path] of endpoints) {
    const res = await request('GET', path, { token, expectStatuses: [200, 403] });
    const ok = res.status === 200;
    record(category, name, ok, ok ? '' : res.json.message || `HTTP ${res.status}`);
  }
}

async function testPublicPages() {
  console.log('\n=== Public pages ===');
  for (const [name, path] of [
    ['Homepage', '/'],
    ['Admin dashboard shell', '/admin/dashboard'],
    ['Employee dashboard shell', '/employee/dashboard'],
  ]) {
    try {
      const res = await fetch(`${BASE}${path}`);
      record('pages', name, res.ok, `HTTP ${res.status}`);
    } catch (err) {
      record('pages', name, false, err.message);
    }
  }
}

async function main() {
  console.log(`HRMS feature smoke test → ${BASE}`);
  console.log(`Super admin: ${SUPER_ADMIN_EMAIL}`);

  await testHealth();
  await testPublicPages();

  const adminLogin = await login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
  if (!adminLogin.ok) {
    record('auth', 'Super admin login', false, adminLogin.detail);
    console.log('\nTip: run `npm run db:reset-super-admin` then retry.');
    printSummary();
    process.exit(1);
  }
  record('auth', 'Super admin login', true, adminLogin.user?.name || SUPER_ADMIN_EMAIL);
  const token = adminLogin.token;
  const userId = adminLogin.user?.id;

  await testAuth(token);
  await testAdminCore(token);
  await testAttendance(token, userId);
  await testExit(token);
  await testEfficiency(token);
  await testAssets(token);
  await testEmployeeDocs(token);
  await testOtherModules(token, userId);

  printSummary();
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed ? 1 : 0);
}

function printSummary() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n========================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed (${results.length} total)`);
  if (failed) {
    console.log('\nFailed checks:');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  • [${r.category}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    }
  }
  console.log('========================================\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
