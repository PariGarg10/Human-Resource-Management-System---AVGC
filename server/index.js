require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getPublicDir, getUploadsRoot } = require('./utils/storagePaths');

const authRoutes = require('./routes/auth');
const biometricRoutes = require('./routes/biometric');
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');
const adminAccountsRoutes = require('./routes/adminAccounts');
const concernRoutes = require('./routes/concerns');
const leaveRoutes = require('./routes/leaves');
const managerRoutes = require('./routes/manager');
const usersRoutes = require('./routes/users');
const managersDirectoryRoutes = require('./routes/managersDirectory');
const notificationsRoutes = require('./routes/notifications');
const saturdayConfigRoutes = require('./routes/saturdayConfig');
const holidaysRoutes = require('./routes/holidays');
const leaveBalanceRoutes = require('./routes/leaveBalance');
const { authMiddleware, enforceForcePasswordChange } = require('./middleware/auth');
const { startBirthdayReminderJob } = require('./jobs/birthdayReminders');
const { startEsslAttendanceSync } = require('./jobs/esslAttendanceSync');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = getPublicDir();

function sendPublicHtml(res, filename) {
  const absolutePath = path.resolve(publicDir, filename);
  res.sendFile(absolutePath, (err) => {
    if (err) {
      console.error(`sendFile failed for ${filename}:`, err.message);
      res.status(500).send('Could not load page');
    }
  });
}

app.use(cors());
app.use(express.json());

// Hard-priority HTML routes (runs before static; avoids "Cannot GET" if another layer shadows routes)
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const p = req.path;
  if (p === '/admin/dashboard') return sendPublicHtml(res, 'admin-dashboard.html');
  if (p === '/admin/dashboard/') return res.redirect(301, '/admin/dashboard');
  if (p === '/employee/dashboard') return sendPublicHtml(res, 'employee-dashboard.html');
  if (p === '/employee/dashboard/') return res.redirect(301, '/employee/dashboard');
  if (p === '/manager/dashboard') return sendPublicHtml(res, 'manager-dashboard.html');
  if (p === '/manager/dashboard/') return res.redirect(301, '/manager/dashboard');
  if (p === '/managers') return sendPublicHtml(res, 'managers.html');
  if (p === '/managers/') return res.redirect(301, '/managers');
  if (p === '/profile') return sendPublicHtml(res, 'employee-dashboard.html');
  if (p === '/profile/') return res.redirect(301, '/profile');
  if (p === '/account/profile') return sendPublicHtml(res, 'employee-dashboard.html');
  if (p === '/account/profile/') return res.redirect(301, '/account/profile');
  if (p === '/forgot-password') return sendPublicHtml(res, 'forgot-password.html');
  if (p === '/reset-password') return sendPublicHtml(res, 'reset-password.html');
  next();
});

// HTML pages — register BEFORE express.static so routes are never shadowed
app.get('/', (_req, res) => sendPublicHtml(res, 'index.html'));
app.get('/login', (_req, res) => sendPublicHtml(res, 'login.html'));
app.get('/forgot-password', (_req, res) => sendPublicHtml(res, 'forgot-password.html'));
app.get('/reset-password', (_req, res) => sendPublicHtml(res, 'reset-password.html'));
app.get('/pricing', (_req, res) => res.redirect(301, '/'));
app.get('/features', (_req, res) => res.redirect(301, '/'));
app.get('/index.html', (_req, res) => res.redirect(301, '/login'));
app.get('/employee/dashboard', (_req, res) => sendPublicHtml(res, 'employee-dashboard.html'));
app.get('/employee/dashboard/', (_req, res) => res.redirect(301, '/employee/dashboard'));
app.get('/app.html', (_req, res) => sendPublicHtml(res, 'employee-dashboard.html'));
app.get('/admin/login', (_req, res) => sendPublicHtml(res, 'admin-login.html'));
app.get('/admin/dashboard', (_req, res) => sendPublicHtml(res, 'admin-dashboard.html'));
app.get('/admin/dashboard/', (_req, res) => res.redirect(301, '/admin/dashboard'));
app.get('/manager/login', (_req, res) => sendPublicHtml(res, 'manager-login.html'));
app.get('/manager/dashboard', (_req, res) => sendPublicHtml(res, 'manager-dashboard.html'));
app.get('/manager/dashboard/', (_req, res) => res.redirect(301, '/manager/dashboard'));
app.get('/admin/manager-assignments', (_req, res) => sendPublicHtml(res, 'admin-manager-assignments.html'));
app.use(
  '/uploads',
  express.static(path.join(publicDir, 'uploads'), { index: false, maxAge: '1h', fallthrough: true })
);
app.use('/uploads', express.static(getUploadsRoot(), { index: false, maxAge: '1h', fallthrough: true }));
app.use(express.static(publicDir, { index: false }));

app.get('/health', async (_req, res) => {
  const payload = { ok: true, vercel: Boolean(process.env.VERCEL) };
  if (!process.env.DATABASE_URL) {
    payload.database = 'missing DATABASE_URL';
    return res.status(503).json(payload);
  }
  try {
    const { pool } = require('./db');
    await pool.query('SELECT 1');
    payload.database = 'connected';
  } catch (err) {
    payload.database = 'error';
    payload.dbError = err.message;
    return res.status(503).json(payload);
  }
  return res.json(payload);
});

app.use('/api', (req, res, next) => {
  const p = req.path;
  if (
    p === '/auth/login' ||
    p === '/auth/forgot-password' ||
    p === '/auth/change-password'
  ) {
    return next();
  }
  if (p === '/auth/me' || p === '/auth/logout') {
    return authMiddleware(req, res, next);
  }
  return authMiddleware(req, res, () => enforceForcePasswordChange(req, res, next));
});

app.use('/api/auth', authRoutes);
app.use('/api/biometric', biometricRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/accounts', adminAccountsRoutes);
app.use('/api/concern', concernRoutes);
app.use('/api/concerns', concernRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/concern', concernRoutes);
app.use('/concerns', concernRoutes);
app.use('/leave', leaveRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/managers', managersDirectoryRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/saturday-config', saturdayConfigRoutes);
app.use('/api/holidays', holidaysRoutes);
app.use('/api/leave-balance', leaveBalanceRoutes);

app.use((err, req, res, _next) => {
  console.error('[AVGC] Unhandled error:', req.method, req.path, err.stack || err.message);
  if (res.headersSent) return;
  res.status(500).json({ message: err.message || 'Internal server error' });
});

async function startBackgroundJobs() {
  if (process.env.VERCEL) {
    console.log('[AVGC] Background jobs disabled on Vercel serverless.');
    return;
  }
  try {
    const { ensureEsslSyncTables } = require('./utils/deviceAttendance');
    await ensureEsslSyncTables();
  } catch (err) {
    console.warn('[AVGC] ESSL tables setup:', err.message);
  }
  startBirthdayReminderJob();
  startEsslAttendanceSync();
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AVGC server running on http://localhost:${PORT}`);
    console.log('[AVGC] HTML dashboards: /employee/dashboard, /manager/dashboard, /admin/dashboard');
    startBackgroundJobs();
  });
}

module.exports = app;
