require('dotenv').config();
const { buildSampleWorkbookBuffer } = require('../utils/holidayImport');
const { resolveAdminContext } = require('../middleware/adminAuth');
const jwt = require('jsonwebtoken');

(async () => {
  const buf = buildSampleWorkbookBuffer();
  const loginRes = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@hrms.com', password: 'Admin@123' }),
  }).catch((e) => ({ ok: false, status: 0, _err: e.message }));

  if (!loginRes.ok) {
    const t = await loginRes.text?.().catch(() => '');
    console.log('login failed', loginRes.status, t.slice(0, 200));
    console.log('Start server with: npm start');
    return;
  }
  const auth = await loginRes.json();
  console.log('login ok adminId', auth.employee?.adminId);

  const payload = jwt.decode(auth.token);
  const ctx = await resolveAdminContext(payload);
  console.log('admin context', ctx ? { isSuperAdmin: ctx.isSuperAdmin, perms: ctx.permissions?.length } : null);

  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'sample.xlsx');
  const preview = await fetch('http://127.0.0.1:3000/api/holidays/import/preview', {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}` },
    body: fd,
  });
  const text = await preview.text();
  console.log('preview', preview.status, text.slice(0, 300));
})();
