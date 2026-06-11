const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { loadAdminPermissions, ALL_MODULES } = require('../utils/adminPermissions');
const { generateEmployeeCode } = require('../utils/employeeCode');
const { sendTemporaryPasswordEmail } = require('../utils/email');
const { resetPasswordWithToken } = require('../utils/passwordReset');

const router = express.Router();

const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 10;
const FORGOT_WINDOW_MS = 60 * 60 * 1000;
const FORGOT_RATE_LIMIT_MAX = 3;
const FAILED_LOGIN_MAX = 5;
const LOCK_MINUTES = 15;
const TEMP_PASSWORD_LENGTH = 10;
const TEMP_PASSWORD_HOURS = 24;
const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000;
const GENERIC_FORGOT_MESSAGE = 'If the email is valid, password reset instructions have been sent.';

const loginAttemptsByIp = new Map();
const forgotRequestsByEmail = new Map();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLoginId(value) {
  return String(value || '').trim();
}

function firstName(name) {
  const value = String(name || '').trim();
  return value ? value.split(/\s+/)[0] : 'there';
}

function cleanupWindow(map, key, windowMs) {
  const now = Date.now();
  const current = map.get(key) || [];
  const pruned = current.filter((ts) => now - ts <= windowMs);
  map.set(key, pruned);
  return pruned;
}

function registerAttempt(map, key, windowMs) {
  const current = cleanupWindow(map, key, windowMs);
  current.push(Date.now());
  map.set(key, current);
  return current.length;
}

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  };
}

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
}

function issueAuthResponse(res, payload, employee, forcePasswordChange) {
  const tokenPayload = {
    ...payload,
    force_password_change: Boolean(forcePasswordChange),
    mustchangepassword: Boolean(forcePasswordChange),
  };
  const token = signToken(tokenPayload);
  res.cookie('token', token, getCookieOptions());
  return res.json({
    token,
    role: tokenPayload.role,
    force_password_change: Boolean(forcePasswordChange),
    mustchangepassword: Boolean(forcePasswordChange),
    requiresPasswordChange: Boolean(forcePasswordChange),
    employee: {
      ...employee,
      force_password_change: Boolean(forcePasswordChange),
      mustchangepassword: Boolean(forcePasswordChange),
      requiresPasswordChange: Boolean(forcePasswordChange),
    },
  });
}

function generateTempPassword(length = TEMP_PASSWORD_LENGTH) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function validateNewPassword(password) {
  const p = String(password || '');
  if (p.length < 8) return 'Password must be at least 8 characters long';
  if (!/[A-Z]/.test(p)) return 'Password must include at least one uppercase letter';
  if (!/[0-9]/.test(p)) return 'Password must include at least one number';
  if (!/[^A-Za-z0-9]/.test(p)) return 'Password must include at least one special character';
  return null;
}

function isFounderEmployee(employee) {
  const role = String(employee?.role || '').toLowerCase().trim();
  const name = String(employee?.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return role === 'founder' || name === 'ashish mishra';
}

async function ensureAdminEmployee(admin) {
  if (admin.employee_id) return admin.employee_id;

  const employeecode = await generateEmployeeCode();
  const insert = await pool.query(
    `
      INSERT INTO employees (
        employeecode, name, email, passwordhash, department, role, isregistered,
        mustchangepassword, force_password_change
      )
      VALUES ($1, $2, $3, $4, $5, 'admin', TRUE, $6, $6)
      RETURNING id
    `,
    [
      employeecode,
      admin.name,
      admin.email,
      admin.passwordhash,
      admin.department,
      Boolean(admin.mustchangepassword),
    ]
  );
  const employeeId = insert.rows[0].id;
  await pool.query('UPDATE admins SET employee_id = $1 WHERE id = $2', [employeeId, admin.id]);
  return employeeId;
}

async function resetFailedLoginState(employeeId) {
  await pool.query(
    'UPDATE employees SET failed_login_attempts = 0, account_locked_until = NULL WHERE id = $1',
    [employeeId]
  );
}

async function applyFailedLogin(employeeId) {
  const update = await pool.query(
    `
      UPDATE employees
      SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1
      WHERE id = $1
      RETURNING failed_login_attempts
    `,
    [employeeId]
  );
  const attempts = Number(update.rows[0]?.failed_login_attempts || 0);
  if (attempts < FAILED_LOGIN_MAX) return { locked: false };

  const lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
  await pool.query(
    `
      UPDATE employees
      SET failed_login_attempts = 0, account_locked_until = $2
      WHERE id = $1
    `,
    [employeeId, lockUntil]
  );
  return { locked: true, lockUntil };
}

async function issueEmployeeLogin(res, employee, allowedRole) {
  const role = String(employee.role || 'employee').toLowerCase().trim();
  const expectedRole = String(allowedRole || '').toLowerCase().trim();
  const founderCanUseAdminLogin = expectedRole === 'admin' && isFounderEmployee(employee);
  if (allowedRole && role !== expectedRole && !founderCanUseAdminLogin) {
    return res.status(403).json({ message: `This login is only for ${allowedRole}` });
  }

  await resetFailedLoginState(employee.id);

  const forcePasswordChange = Boolean(employee.force_password_change || employee.mustchangepassword);
  const payload = {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    role,
  };
  if (role !== 'employee') payload.employeecode = employee.employeecode;

  const safeEmployee = {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    department: employee.department,
    designation: employee.designation || null,
    reportingToId: employee.reporting_to_id ?? null,
    role,
    employeecode: employee.employeecode,
    force_password_change: forcePasswordChange,
  };

  return issueAuthResponse(res, payload, safeEmployee, forcePasswordChange);
}

async function handleEmployeeCredentialLogin(res, loginId, password, allowedRole) {
  const result = await pool.query(
    `
      SELECT id, employeecode, name, email, passwordhash, role, department, designation, reporting_to_id,
             mustchangepassword, force_password_change, temp_password_hash,
             temp_password_expiry, failed_login_attempts, account_locked_until
      FROM employees
      WHERE lower(trim(email)) = lower($1)
         OR upper(trim(employeecode)) = upper($1)
      LIMIT 1
    `,
    [loginId]
  );
  const employee = result.rows[0];
  if (!employee) return res.status(401).json({ message: 'Invalid credentials' });

  const now = new Date();
  if (employee.account_locked_until && new Date(employee.account_locked_until) > now) {
    const minutes = Math.max(
      1,
      Math.ceil((new Date(employee.account_locked_until).getTime() - now.getTime()) / 60000)
    );
    return res.status(403).json({ message: `Account locked. Try again after ${minutes} minutes` });
  }

  const passwordMatches = employee.passwordhash
    ? await bcrypt.compare(String(password), employee.passwordhash)
    : false;
  const tempMatches = employee.temp_password_hash
    ? await bcrypt.compare(String(password), employee.temp_password_hash)
    : false;

  if (!passwordMatches && !tempMatches) {
    const failed = await applyFailedLogin(employee.id);
    if (failed.locked) {
      return res.status(403).json({ message: `Account locked. Try again after ${LOCK_MINUTES} minutes` });
    }
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (tempMatches) {
    if (!employee.temp_password_expiry || new Date(employee.temp_password_expiry) <= now) {
      return res.status(401).json({ message: 'Temporary password expired. Please request a new one.' });
    }
    employee.force_password_change = true;
  }

  return issueEmployeeLogin(res, employee, allowedRole);
}

async function issueAdminLogin(res, email, password) {
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const loginId = normalizeEmail(email);
  const adminResult = await pool.query(
    `
      SELECT id, name, email, passwordhash, designation, department, is_super_admin, is_active,
             employee_id, mustchangepassword
      FROM admins
      WHERE lower(trim(email)) = $1
      LIMIT 1
    `,
    [loginId]
  );
  const admin = adminResult.rows[0];
  if (!admin) return handleEmployeeCredentialLogin(res, loginId, password, 'admin');
  if (!admin.is_active) return res.status(403).json({ message: 'This admin account is deactivated' });

  const matched = await bcrypt.compare(String(password), admin.passwordhash);
  if (!matched) return res.status(401).json({ message: 'Invalid credentials' });

  const employeeId = await ensureAdminEmployee(admin);
  await pool.query(`UPDATE employees SET role = 'admin' WHERE id = $1`, [employeeId]);
  const permissions = admin.is_super_admin ? ALL_MODULES : await loadAdminPermissions(pool, admin.id);
  const empRow = await pool.query(
    `
      SELECT employeecode, department, force_password_change, mustchangepassword
      FROM employees
      WHERE id = $1
      LIMIT 1
    `,
    [employeeId]
  );
  const employee = empRow.rows[0] || {};
  const forcePasswordChange = Boolean(
    admin.mustchangepassword || employee.force_password_change || employee.mustchangepassword
  );

  const payload = {
    id: employeeId,
    adminId: admin.id,
    name: admin.name,
    email: admin.email,
    role: 'admin',
    isSuperAdmin: Boolean(admin.is_super_admin),
    permissions,
    employeecode: employee.employeecode || null,
    department: employee.department || admin.department || null,
  };

  const safeEmployee = {
    id: employeeId,
    adminId: admin.id,
    name: admin.name,
    email: admin.email,
    department: payload.department,
    role: 'admin',
    designation: admin.designation,
    isSuperAdmin: Boolean(admin.is_super_admin),
    permissions,
    employeecode: payload.employeecode,
    force_password_change: forcePasswordChange,
  };

  return issueAuthResponse(res, payload, safeEmployee, forcePasswordChange);
}

async function runRoleLogin(req, res, allowedRole) {
  const email = normalizeLoginId(req.body?.email);
  const password = String(req.body?.password || '');
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
  const attempts = registerAttempt(loginAttemptsByIp, ip, LOGIN_WINDOW_MS);
  if (attempts > LOGIN_RATE_LIMIT_MAX) {
    return res.status(429).json({ message: 'Too many login attempts. Try again in a minute.' });
  }

  if (allowedRole === 'admin') return issueAdminLogin(res, email, password);
  return handleEmployeeCredentialLogin(res, email, password, allowedRole || null);
}

router.post('/login', async (req, res) => {
  try {
    return await runRoleLogin(req, res, null);
  } catch (err) {
    console.error('POST /auth/login:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/employee/login', async (req, res) => {
  try {
    return await runRoleLogin(req, res, 'employee');
  } catch (err) {
    console.error('POST /auth/employee/login:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/manager/login', async (req, res) => {
  try {
    return await runRoleLogin(req, res, 'manager');
  } catch (err) {
    console.error('POST /auth/manager/login:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/admin/login', async (req, res) => {
  try {
    return await runRoleLogin(req, res, 'admin');
  } catch (err) {
    console.error('POST /auth/admin/login:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/it-head/login', async (req, res) => {
  try {
    return await runRoleLogin(req, res, 'it_head');
  } catch (err) {
    console.error('POST /auth/it-head/login:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    console.log('[ForgotPassword] Request received for email:', email);
    if (!email) return res.status(200).json({ message: GENERIC_FORGOT_MESSAGE });

    const requested = registerAttempt(forgotRequestsByEmail, email, FORGOT_WINDOW_MS);
    if (requested > FORGOT_RATE_LIMIT_MAX) {
      return res.status(429).json({ message: 'Too many reset requests. Try again later.' });
    }

    const userRes = await pool.query(
      `
        SELECT id, name, email
        FROM employees
        WHERE lower(trim(email)) = $1
        LIMIT 1
      `,
      [email]
    );
    const user = userRes.rows[0];
    console.log('[ForgotPassword] User found:', !!user);

    if (user) {
      const tempPassword = generateTempPassword();
      console.log('[ForgotPassword] Temp password generated');
      const tempHash = await bcrypt.hash(tempPassword, 10);
      const expiry = new Date(Date.now() + TEMP_PASSWORD_HOURS * 60 * 60 * 1000);

      await pool.query(
        `
          UPDATE employees
          SET temp_password_hash = $2,
              temp_password_expiry = $3,
              force_password_change = TRUE,
              mustchangepassword = TRUE,
              failed_login_attempts = 0,
              account_locked_until = NULL
          WHERE id = $1
        `,
        [user.id, tempHash, expiry]
      );

      try {
        console.log('[ForgotPassword] Attempting to send email...');
        const result = await sendTemporaryPasswordEmail({
          to: user.email,
          firstName: firstName(user.name),
          tempPassword,
        });
        console.log('[ForgotPassword] Email send result:', result);
      } catch (error) {
        console.error('[ForgotPassword] Email send FAILED:', error);
        throw error;
      }
    }

    return res.status(200).json({ message: GENERIC_FORGOT_MESSAGE });
  } catch (err) {
    console.error('[ForgotPassword] Email send FAILED:', err);
    console.error('POST /auth/forgot-password:', err.message);
    return res.status(200).json({ message: GENERIC_FORGOT_MESSAGE });
  }
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const currentPassword = String(req.body?.current_password || req.body?.currentPassword || '');
    const newPassword = String(req.body?.new_password || req.body?.newPassword || '');
    const confirmPassword = String(
      req.body?.confirm_password || req.body?.confirmPassword || req.body?.new_password || req.body?.newPassword || ''
    );

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'new_password and confirm_password are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'New password and confirm password must match' });
    }

    const strengthError = validateNewPassword(newPassword);
    if (strengthError) return res.status(400).json({ message: strengthError });

    const userRes = await pool.query(
      `
        SELECT id, passwordhash, temp_password_hash, force_password_change, mustchangepassword
        FROM employees
        WHERE id = $1
        LIMIT 1
      `,
      [req.user.id]
    );
    const user = userRes.rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid session' });

    if (currentPassword) {
      const matchesMain = user.passwordhash ? await bcrypt.compare(currentPassword, user.passwordhash) : false;
      const matchesTemp = user.temp_password_hash
        ? await bcrypt.compare(currentPassword, user.temp_password_hash)
        : false;
      if (!matchesMain && !matchesTemp) {
        return res.status(401).json({ message: 'Current password is invalid' });
      }
    } else if (!(user.force_password_change || user.mustchangepassword)) {
      return res.status(400).json({ message: 'Current password is required' });
    }

    if (user.temp_password_hash) {
      const matchesTemp = await bcrypt.compare(newPassword, user.temp_password_hash);
      if (matchesTemp) {
        return res.status(400).json({ message: 'New password must not match temporary password' });
      }
    }

    const passwordhash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `
        UPDATE employees
        SET passwordhash = $2,
            temp_password_hash = NULL,
            temp_password_expiry = NULL,
            force_password_change = FALSE,
            mustchangepassword = FALSE,
            failed_login_attempts = 0,
            account_locked_until = NULL
        WHERE id = $1
      `,
      [req.user.id, passwordhash]
    );

    if (req.user.adminId) {
      await pool.query('UPDATE admins SET passwordhash = $1, mustchangepassword = FALSE WHERE id = $2', [
        passwordhash,
        req.user.adminId,
      ]);
    }

    await logAudit(req.user.id, 'PASSWORD_CHANGED', 'auth', null);

    const refreshedRes = await pool.query(
      `
        SELECT id, name, email, role, department, employeecode
        FROM employees
        WHERE id = $1
        LIMIT 1
      `,
      [req.user.id]
    );
    const refreshed = refreshedRes.rows[0];
    const payload = {
      id: refreshed.id,
      name: refreshed.name,
      email: refreshed.email,
      role: refreshed.role,
      adminId: req.user.adminId || undefined,
      permissions: req.user.permissions || undefined,
      isSuperAdmin: req.user.isSuperAdmin || undefined,
      employeecode: refreshed.employeecode || undefined,
    };
    const safeEmployee = {
      id: refreshed.id,
      name: refreshed.name,
      email: refreshed.email,
      role: refreshed.role,
      department: refreshed.department,
      employeecode: refreshed.employeecode,
      force_password_change: false,
    };
    return issueAuthResponse(res, payload, safeEmployee, false);
  } catch (err) {
    console.error('POST /auth/change-password:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT id, name, email, role, force_password_change, mustchangepassword
        FROM employees
        WHERE id = $1
        LIMIT 1
      `,
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid session' });

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      force_password_change: Boolean(user.force_password_change || user.mustchangepassword),
    });
  } catch (err) {
    console.error('GET /auth/me:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token', { path: '/' });
  return res.status(200).json({ message: 'Logged out successfully' });
});

router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    const newPassword = String(req.body?.newPassword || req.body?.new_password || '');
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'token and newPassword are required' });
    }

    const strengthError = validateNewPassword(newPassword);
    if (strengthError) return res.status(400).json({ message: strengthError });

    const result = await resetPasswordWithToken(token, newPassword);
    if (!result.ok) {
      return res.status(400).json({ message: result.message, code: result.code });
    }
    return res.status(200).json({ message: result.message });
  } catch (err) {
    console.error('POST /auth/reset-password:', err.message);
    return res.status(400).json({
      message: 'This link is invalid or has expired. Please request a new one.',
      code: 'INVALID',
    });
  }
});

module.exports = router;
