require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const { getPublicDir, getUploadsRoot } = require('./utils/storagePaths');
const { isProductionRuntime } = require('./utils/runtimeEnv');

const authRoutes = require('./routes/auth');
const biometricRoutes = require('./routes/biometric');
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');
const adminAccountsRoutes = require('./routes/adminAccounts');
const assetsRoutes = require('./routes/assets');
const policiesRoutes = require('./routes/policies');
const policyChatRoutes = require('./routes/policyChat');
const liveActivitiesRoutes = require('./routes/liveActivities');
const employeeDocumentsRoutes = require('./routes/employeeDocuments');
const homeRecognitionRoutes = require('./routes/homeRecognition');
const socialPostsRoutes = require('./routes/socialPosts');
const socialTournamentsRoutes = require('./routes/socialTournaments');
const leaveRoutes = require('./routes/leaves');
const managerRoutes = require('./routes/manager');
const usersRoutes = require('./routes/users');
const employeesRoutes = require('./routes/employees');
const exitRoutes = require('./routes/exit');
const onboardingRoutes = require('./routes/onboarding');
const poshRoutes = require('./routes/posh');
const orgChartRoutes = require('./routes/orgChart');
const managersDirectoryRoutes = require('./routes/managersDirectory');
const notificationsRoutes = require('./routes/notifications');
const saturdayConfigRoutes = require('./routes/saturdayConfig');
const holidaysRoutes = require('./routes/holidays');
const leaveBalanceRoutes = require('./routes/leaveBalance');
const performanceRoutes = require('./routes/performance');
const dashboardRoutes = require('./routes/dashboard');
const { authMiddleware, enforceForcePasswordChange } = require('./middleware/auth');
const { enforceOnboardingComplete } = require('./middleware/onboardingGate');
const { startBirthdayReminderJob } = require('./jobs/birthdayReminders');
const { startExitDeactivationJob } = require('./jobs/exitDeactivation');
const { startEsslAttendanceSync } = require('./jobs/esslAttendanceSync');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = getPublicDir();
const isProd = isProductionRuntime();
const staticMaxAge = isProd ? '30d' : 0;

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
app.use(compression({ threshold: 1024 }));
app.use(express.json());

// Hard-priority HTML routes (runs before static; avoids "Cannot GET" if another layer shadows routes)
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const p = req.path;
  if (p === '/admin/dashboard') return sendPublicHtml(res, 'admin-dashboard.html');
  if (p === '/admin/dashboard/') return res.redirect(301, '/admin/dashboard');
  if (p === '/admin/onboarding') return sendPublicHtml(res, 'admin-dashboard.html');
  if (p === '/employee/dashboard') return sendPublicHtml(res, 'employee-dashboard.html');
  if (p === '/employee/dashboard/') return res.redirect(301, '/employee/dashboard');
  if (p === '/employee/onboarding' || p === '/employee/exit') {
    return sendPublicHtml(res, 'employee-dashboard.html');
  }
  if (p === '/manager/dashboard') return sendPublicHtml(res, 'manager-dashboard.html');
  if (p === '/manager/dashboard/') return res.redirect(301, '/manager/dashboard');
  if (p === '/manager/exit-clearances') return sendPublicHtml(res, 'manager-dashboard.html');
  if (p === '/managers') return sendPublicHtml(res, 'managers.html');
  if (p === '/managers/') return res.redirect(301, '/managers');
  if (p === '/admin/manager-assignments') return sendPublicHtml(res, 'admin-manager-assignments.html');
  if (p === '/admin/manager-assignments/') return res.redirect(301, '/admin/manager-assignments');
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
app.get('/register', (_req, res) => res.redirect(301, '/login'));
app.get('/forgot-password', (_req, res) => sendPublicHtml(res, 'forgot-password.html'));
app.get('/reset-password', (_req, res) => sendPublicHtml(res, 'reset-password.html'));
app.get('/pricing', (_req, res) => res.redirect(301, '/'));
app.get('/features', (_req, res) => res.redirect(301, '/'));
app.get('/index.html', (_req, res) => res.redirect(301, '/'));
app.get('/employee/dashboard', (_req, res) => sendPublicHtml(res, 'employee-dashboard.html'));
app.get('/employee/dashboard/', (_req, res) => res.redirect(301, '/employee/dashboard'));
app.get('/employee/onboarding', (_req, res) => sendPublicHtml(res, 'employee-dashboard.html'));
app.get('/employee/exit', (_req, res) => sendPublicHtml(res, 'employee-dashboard.html'));
app.get('/app.html', (_req, res) => sendPublicHtml(res, 'employee-dashboard.html'));
app.get('/admin/login', (_req, res) => sendPublicHtml(res, 'admin-login.html'));
app.get('/admin/dashboard', (_req, res) => sendPublicHtml(res, 'admin-dashboard.html'));
app.get('/admin/dashboard/', (_req, res) => res.redirect(301, '/admin/dashboard'));
app.get('/admin/onboarding', (_req, res) => sendPublicHtml(res, 'admin-dashboard.html'));
app.get('/manager/login', (_req, res) => sendPublicHtml(res, 'manager-login.html'));
app.get('/manager/dashboard', (_req, res) => sendPublicHtml(res, 'manager-dashboard.html'));
app.get('/manager/dashboard/', (_req, res) => res.redirect(301, '/manager/dashboard'));
app.get('/manager/exit-clearances', (_req, res) => sendPublicHtml(res, 'manager-dashboard.html'));
app.get('/admin/manager-assignments', (_req, res) => sendPublicHtml(res, 'admin-manager-assignments.html'));
app.use(
  '/uploads',
  express.static(path.join(publicDir, 'uploads'), { index: false, maxAge: '1h', fallthrough: true })
);
app.use('/uploads', express.static(getUploadsRoot(), { index: false, maxAge: '1h', fallthrough: true }));
app.use(
  '/assets',
  express.static(path.join(publicDir, 'assets'), {
    index: false,
    maxAge: staticMaxAge,
    immutable: isProd,
    etag: true,
  })
);
app.use(
  '/css',
  express.static(path.join(publicDir, 'css'), {
    index: false,
    maxAge: staticMaxAge,
    etag: true,
  })
);
app.use(
  '/js',
  express.static(path.join(publicDir, 'js'), {
    index: false,
    maxAge: staticMaxAge,
    etag: true,
  })
);
app.use(
  express.static(publicDir, {
    index: false,
    maxAge: staticMaxAge,
    etag: true,
  })
);

app.get('/health', async (_req, res) => {
  const strict = String(_req.query.strict || '').toLowerCase() === '1';
  const { verifyConnection, databaseHostLabel } = require('./db');
  const payload = {
    ok: true,
    service: 'avgc-hrms',
    vercel: Boolean(process.env.VERCEL),
    railway: Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID),
    databaseHost: databaseHostLabel(),
    useLocalDb: process.env.USE_LOCAL_DB === 'true',
  };

  if (!process.env.DATABASE_URL && !(process.env.USE_LOCAL_DB === 'true' && process.env.LOCAL_DATABASE_URL)) {
    payload.database = 'missing DATABASE_URL';
    payload.ok = false;
    return strict ? res.status(503).json(payload) : res.json(payload);
  }

  const result = await verifyConnection();
  if (result.ok) {
    payload.database = 'connected';
    payload.dbMs = result.ms;
    return res.json(payload);
  }
  payload.ok = false;
  payload.database = 'error';
  payload.dbError = result.message;
  return strict ? res.status(503).json(payload) : res.json(payload);
});

app.use('/api', (req, res, next) => {
  const { isDbCachedUnavailable, databaseHostLabel } = require('./db');
  if (!isDbCachedUnavailable()) return next();
  return res.status(503).json({
    message: `Database unreachable (${databaseHostLabel()}). Run npm run db:check for fix steps.`,
  });
});

let apiSchemaEnsured = false;
let apiSchemaEnsureFailedAt = 0;
app.use('/api', async (req, res, next) => {
  if (apiSchemaEnsured) return next();
  if (apiSchemaEnsureFailedAt && Date.now() - apiSchemaEnsureFailedAt < 60000) {
    return next();
  }
  try {
    const { ensureEmployeeSchemaColumns } = require('./utils/ensureSchema');
    await ensureEmployeeSchemaColumns();
    apiSchemaEnsured = true;
    apiSchemaEnsureFailedAt = 0;
  } catch (err) {
    apiSchemaEnsureFailedAt = Date.now();
    console.warn('[AVGC] Schema ensure on API request:', err.message);
  }
  next();
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
  if (p === '/home-recognition' && req.method === 'GET') {
    return next();
  }
  // ESSL office bridge uses x-api-key, not JWT
  if (p === '/biometric/essl-sync' || p === '/biometric/punch') {
    return next();
  }
  if (p === '/auth/me' || p === '/auth/logout') {
    return authMiddleware(req, res, next);
  }
  const apiPath = String(req.path || '').split('?')[0];
  const skipPasswordGate =
    apiPath === '/users/employee-directory' || apiPath.startsWith('/users/profile-photo/employee/');
  return authMiddleware(req, res, () => {
    if (skipPasswordGate) {
      return enforceOnboardingComplete(req, res, next);
    }
    return enforceForcePasswordChange(req, res, () => enforceOnboardingComplete(req, res, next));
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/biometric', biometricRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/accounts', adminAccountsRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/leave', leaveRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/exit', exitRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/posh', poshRoutes);
app.use('/api/org-chart', orgChartRoutes);
app.use('/api/managers', managersDirectoryRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/saturday-config', saturdayConfigRoutes);
app.use('/api/holidays', holidaysRoutes);
app.use('/api/leave-balance', leaveBalanceRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/policies', policiesRoutes);
app.use('/api/policies', policyChatRoutes);
app.use('/api/live-activities', liveActivitiesRoutes);
app.use('/api/employee-documents', employeeDocumentsRoutes);
app.use('/api/home-recognition', homeRecognitionRoutes);
app.use('/api/social-posts', socialPostsRoutes);
app.use('/api/social-tournaments', socialTournamentsRoutes);

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
  startExitDeactivationJob();
  startEsslAttendanceSync();
}

if (require.main === module) {
  (async () => {
    const { warmPool } = require('./db');
    await warmPool();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`AVGC server running on port ${PORT} (${isProd ? 'production' : 'development'} mode)`);
      console.log('[AVGC] HTML dashboards: /employee/dashboard, /manager/dashboard, /admin/dashboard');
      startBackgroundJobs();
    });

    try {
      const { ensureEmployeeSchemaColumns } = require('./utils/ensureSchema');
      await ensureEmployeeSchemaColumns();
      apiSchemaEnsured = true;
      console.log('[AVGC] Schema ensure complete');
    } catch (err) {
      apiSchemaEnsureFailedAt = Date.now();
      console.warn('[AVGC] Schema ensure failed (login may fail until db:init):', err.message);
    }
  })();
}

module.exports = app;
