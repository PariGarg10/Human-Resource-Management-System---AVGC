const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { isAdminRole } = require('../constants/roles');
const { loadAdminPermissions, ALL_MODULES } = require('../utils/adminPermissions');

function parseCookies(cookieHeader) {
  const cookies = {};
  const raw = String(cookieHeader || '').split(';');
  for (const part of raw) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    cookies[key] = value;
  }
  return cookies;
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies.token || null;
}

const AUTH_CACHE_TTL_MS = 60_000;
const authUserCache = new Map();

function authCacheKey(employeeId, adminId = '') {
  return `${employeeId}:${adminId || ''}`;
}

function getCachedAuthUser(employeeId, adminId = '') {
  const key = authCacheKey(employeeId, adminId);
  const entry = authUserCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > AUTH_CACHE_TTL_MS) {
    authUserCache.delete(key);
    return null;
  }
  return entry.user;
}

function setCachedAuthUser(employeeId, adminId, user) {
  authUserCache.set(authCacheKey(employeeId, adminId), { user, at: Date.now() });
}

function invalidateAuthUserCache(userId, adminId = '') {
  authUserCache.delete(`${userId}:${adminId || ''}`);
}

async function hydrateAuthUser(payload) {
  const employeeId = Number(payload?.id);
  if (!Number.isFinite(employeeId)) return null;

  let adminId = payload?.adminId ? Number(payload.adminId) : null;
  if (!adminId) {
    const linked = await pool.query(
      'SELECT id FROM admins WHERE employee_id = $1 AND is_active = TRUE LIMIT 1',
      [employeeId]
    );
    adminId = linked.rows[0]?.id ?? null;
  }

  const cached = getCachedAuthUser(employeeId, adminId || '');
  if (cached) return cached;

  const userRes = await pool.query(
    `
      SELECT id, name, email, role, mustchangepassword, force_password_change
      FROM employees
      WHERE id = $1
      LIMIT 1
    `,
    [employeeId]
  );
  const employee = userRes.rows[0];
  if (!employee) return null;

  let forcePasswordChange = Boolean(employee.force_password_change || employee.mustchangepassword);
  let role = String(employee.role || '').toLowerCase().trim();
  let isSuperAdmin = Boolean(payload?.isSuperAdmin);
  let permissions = Array.isArray(payload?.permissions) ? payload.permissions : null;

  if (adminId) {
    const adminRes = await pool.query(
      'SELECT mustchangepassword, is_super_admin FROM admins WHERE id = $1 AND is_active = TRUE LIMIT 1',
      [adminId]
    );
    if (!adminRes.rows[0]) return null;
    forcePasswordChange = forcePasswordChange || Boolean(adminRes.rows[0].mustchangepassword);
    isSuperAdmin = Boolean(adminRes.rows[0].is_super_admin);
    role = 'admin';
    if (!permissions) {
      permissions = isSuperAdmin ? ALL_MODULES : await loadAdminPermissions(pool, adminId);
    }
    pool
      .query(`UPDATE employees SET role = 'admin' WHERE id = $1 AND role IS DISTINCT FROM 'admin'`, [employeeId])
      .catch(() => {});
  }

  const user = {
    ...payload,
    id: employee.id,
    name: employee.name,
    email: employee.email,
    role,
    adminId: adminId || undefined,
    isSuperAdmin: adminId ? isSuperAdmin : undefined,
    permissions: adminId ? permissions : undefined,
    force_password_change: forcePasswordChange,
    mustchangepassword: forcePasswordChange,
  };
  setCachedAuthUser(employeeId, adminId || '', user);
  return user;
}

function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Authorization token missing' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    hydrateAuthUser(payload)
      .then((user) => {
        if (!user) {
          console.warn(
            'Auth rejected token for employee id=%s adminId=%s (user missing or admin inactive)',
            payload?.id,
            payload?.adminId || ''
          );
          return res.status(401).json({ message: 'Invalid token' });
        }
        req.user = user;
        return next();
      })
      .catch((err) => {
        console.error('Auth middleware user hydrate failed:', err.message);
        return res.status(500).json({ message: 'Internal server error' });
      });
  } catch (error) {
    if (error && error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function enforceForcePasswordChange(req, res, next) {
  if (req.user?.force_password_change || req.user?.mustchangepassword) {
    return res.status(403).json({
      message: 'Password change required before accessing this resource',
      code: 'FORCE_PASSWORD_CHANGE',
      requiresPasswordChange: true,
    });
  }
  return next();
}

function requireRoles(...roles) {
  const allowed = roles.map((r) => String(r).toLowerCase().trim());
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    if (req.user.adminId && allowed.includes('admin')) {
      return next();
    }
    const userRole = String(req.user.role || '').toLowerCase().trim();
    if (allowed.includes(userRole)) {
      return next();
    }
    if (
      isFounderUser(req.user) &&
      (allowed.includes('founder') || allowed.includes('admin') || allowed.includes('it_head'))
    ) {
      return next();
    }
    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
  };
}

/** Admin portal routes — honors admin table sessions and founder-profile admins. */
function requirePortalAdmin(req, res, next) {
  if (!req.user) {
    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
  }
  if (req.user.adminId) return next();
  const role = String(req.user.role || '').toLowerCase().trim();
  if (isAdminRole(role) || isFounderUser(req.user)) return next();
  return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
}

/** Any active admin account (portal session, admin role, or linked admins row). */
async function requireAnyAdmin(req, res, next) {
  if (!req.user) {
    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
  }
  if (req.user.adminId) return next();
  const role = String(req.user.role || '').toLowerCase().trim();
  if (isAdminRole(role) || isFounderUser(req.user)) return next();
  try {
    const { rows } = await pool.query(
      'SELECT id FROM admins WHERE employee_id = $1 AND is_active = TRUE LIMIT 1',
      [req.user.id]
    );
    if (rows[0]) return next();
  } catch (err) {
    console.error('requireAnyAdmin lookup failed:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
  return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
}

function isFounderUser(user) {
  const role = String(user?.role || '').toLowerCase().trim();
  const name = String(user?.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return role === 'founder' || name === 'ashish mishra';
}

async function requireAdminOrFounder(req, res, next) {
  if (!req.user?.id) {
    return res.status(403).json({ message: 'Forbidden: only admin or founder can access this resource' });
  }
  try {
    const result = await pool.query('SELECT id, name, role FROM employees WHERE id = $1', [req.user.id]);
    const currentUser = result.rows[0];
    const userRole = String(currentUser?.role || '').toLowerCase().trim();
    if (!currentUser || (userRole !== 'admin' && !isFounderUser(currentUser))) {
      return res.status(403).json({ message: 'Forbidden: only admin or founder can access this resource' });
    }
    req.currentUser = currentUser;
    return next();
  } catch (err) {
    console.error('Admin/founder permission check failed:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

function enforcePasswordChange(req, res, next) {
  if (
    req.user &&
    (req.user.mustchangepassword || req.user.force_password_change) &&
    req.path !== '/change-password'
  ) {
    return res.status(403).json({
      message: 'Password change required before accessing this resource',
      requiresPasswordChange: true
    });
  }
  return next();
}

module.exports = {
  authMiddleware,
  enforceForcePasswordChange,
  requireRoles,
  requirePortalAdmin,
  requireAnyAdmin,
  requireAdminOrFounder,
  isFounderUser,
  enforcePasswordChange,
  invalidateAuthUserCache,
};
