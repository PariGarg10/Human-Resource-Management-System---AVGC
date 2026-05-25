const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { sendPasswordResetEmail } = require('./email');

const TOKEN_BYTES = 32;
const EXPIRY_MINUTES = 15;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const GENERIC_SUCCESS =
  'If this email exists, a reset link has been sent to your inbox';

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function generateRawToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function mapEmployeeUserType(role) {
  const r = String(role || 'employee').toLowerCase().trim();
  if (r === 'manager') return 'manager';
  return 'employee';
}

/**
 * Resolve account across admins (Super Admin, Director, Admin) and employees (Manager, Employee, etc.).
 */
async function resolveAccountByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const adminResult = await pool.query(
    `
      SELECT id, name, email, employee_id, is_active
      FROM admins
      WHERE lower(trim(email)) = $1
      LIMIT 1
    `,
    [normalized]
  );
  const admin = adminResult.rows[0];
  if (admin) {
    if (!admin.is_active) return null;
    return {
      userType: 'admin',
      userId: admin.id,
      name: admin.name,
      email: admin.email,
      employeeId: admin.employee_id,
    };
  }

  const empResult = await pool.query(
    `
      SELECT id, name, email, role
      FROM employees
      WHERE lower(trim(email)) = $1
      LIMIT 1
    `,
    [normalized]
  );
  const employee = empResult.rows[0];
  if (!employee) return null;

  return {
    userType: mapEmployeeUserType(employee.role),
    userId: employee.id,
    name: employee.name,
    email: employee.email,
    employeeId: employee.id,
  };
}

async function countRecentResetRequests(email) {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const { rows } = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM password_reset_tokens
      WHERE lower(email) = lower($1) AND created_at >= $2
    `,
    [normalizeEmail(email), since]
  );
  return rows[0]?.count || 0;
}

async function invalidateUnusedTokens(userId, userType) {
  await pool.query(
    `
      UPDATE password_reset_tokens
      SET used = TRUE
      WHERE user_id = $1 AND user_type = $2 AND used = FALSE
    `,
    [userId, userType]
  );
}

async function createAndSendResetToken(account) {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);

  await invalidateUnusedTokens(account.userId, account.userType);

  await pool.query(
    `
      INSERT INTO password_reset_tokens (user_id, user_type, email, token_hash, expires_at, used)
      VALUES ($1, $2, $3, $4, $5, FALSE)
    `,
    [account.userId, account.userType, normalizeEmail(account.email), tokenHash, expiresAt]
  );

  await sendPasswordResetEmail({
    to: account.email,
    name: account.name,
    rawToken,
  });
}

async function requestPasswordReset(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { message: GENERIC_SUCCESS };
  }

  const recentCount = await countRecentResetRequests(normalized);
  if (recentCount >= RATE_LIMIT_MAX) {
    return { message: GENERIC_SUCCESS };
  }

  const account = await resolveAccountByEmail(normalized);
  if (account) {
    try {
      await createAndSendResetToken(account);
    } catch (err) {
      console.error('[passwordReset] send failed:', err.message);
    }
  }

  return { message: GENERIC_SUCCESS };
}

async function findValidTokenRecord(rawToken) {
  if (!rawToken || String(rawToken).length < 16) return { error: 'INVALID' };

  const tokenHash = hashToken(rawToken);
  const { rows } = await pool.query(
    `
      SELECT id, user_id, user_type, expires_at, used
      FROM password_reset_tokens
      WHERE token_hash = $1
      LIMIT 1
    `,
    [tokenHash]
  );
  const row = rows[0];
  if (!row) return { error: 'INVALID' };
  if (row.used) return { error: 'USED', record: row };
  if (new Date(row.expires_at) < new Date()) return { error: 'EXPIRED', record: row };
  return { record: row };
}

async function applyPasswordForAccount(userType, userId, passwordhash) {
  if (userType === 'admin') {
    const admin = await pool.query('SELECT employee_id FROM admins WHERE id = $1', [userId]);
    await pool.query(
      'UPDATE admins SET passwordhash = $1, mustchangepassword = FALSE WHERE id = $2',
      [passwordhash, userId]
    );
    const employeeId = admin.rows[0]?.employee_id;
    if (employeeId) {
      await pool.query(
        'UPDATE employees SET passwordhash = $1, mustchangepassword = FALSE WHERE id = $2',
        [passwordhash, employeeId]
      );
    }
    return;
  }

  await pool.query(
    'UPDATE employees SET passwordhash = $1, mustchangepassword = FALSE WHERE id = $2',
    [passwordhash, userId]
  );
}

async function resetPasswordWithToken(rawToken, newPassword) {
  const lookup = await findValidTokenRecord(rawToken);
  if (lookup.error === 'USED') {
    return {
      ok: false,
      code: 'USED',
      message: 'This reset link has already been used. Please request a new one.',
    };
  }
  if (lookup.error === 'EXPIRED' || lookup.error === 'INVALID') {
    return {
      ok: false,
      code: lookup.error,
      message: 'This link is invalid or has expired. Please request a new one.',
    };
  }

  const { record } = lookup;
  const passwordhash = bcrypt.hashSync(newPassword, 10);

  await applyPasswordForAccount(record.user_type, record.user_id, passwordhash);
  await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [record.id]);

  return { ok: true, message: 'Password reset successful. Please login.' };
}

function validatePasswordStrength(password) {
  const p = String(password || '');
  if (p.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-zA-Z]/.test(p)) return 'Password must include at least one letter';
  if (!/[0-9]/.test(p)) return 'Password must include at least one number';
  return null;
}

module.exports = {
  GENERIC_SUCCESS,
  normalizeEmail,
  resolveAccountByEmail,
  requestPasswordReset,
  resetPasswordWithToken,
  validatePasswordStrength,
  hashToken,
};
