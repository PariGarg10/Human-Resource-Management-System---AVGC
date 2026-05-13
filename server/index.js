require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./db');

const authRoutes = require('./routes/auth');
const biometricRoutes = require('./routes/biometric');
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');
const leaveRoutes = require('./routes/leaves');
const managerRoutes = require('./routes/manager');
const usersRoutes = require('./routes/users');
const managersDirectoryRoutes = require('./routes/managersDirectory');
const { startBirthdayReminderJob } = require('./jobs/birthdayReminders');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, '..', 'public');

function sendPublicHtml(res, filename) {
  const absolutePath = path.resolve(publicDir, filename);
  res.sendFile(absolutePath, (err) => {
    if (err) {
      console.error(`sendFile failed for ${filename}:`, err.message);
      res.status(500).send('Could not load page');
    }
  });
}

initDatabase();

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
  next();
});

// HTML pages — register BEFORE express.static so routes are never shadowed
app.get('/', (_req, res) => sendPublicHtml(res, 'index.html'));
app.get('/login', (_req, res) => sendPublicHtml(res, 'login.html'));
app.get('/pricing', (_req, res) => sendPublicHtml(res, 'pricing.html'));
app.get('/features', (_req, res) => sendPublicHtml(res, 'features.html'));
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

app.use(express.static(publicDir, { index: false }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/biometric', biometricRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/managers', managersDirectoryRoutes);

app.listen(PORT, () => {
  console.log(`AVGC server running on http://localhost:${PORT}`);
  console.log('[AVGC] HTML dashboards: /employee/dashboard, /manager/dashboard, /admin/dashboard');
  startBirthdayReminderJob();
});
