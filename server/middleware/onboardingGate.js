const { pool } = require('../db');

/** API paths employees may use before onboarding is complete. */
function isOnboardingWhitelisted(path, method) {
  const p = String(path || '').split('?')[0];
  if (p.startsWith('/onboarding')) return true;
  if (p.startsWith('/posh')) return true;
  if (p === '/users/me' || p.startsWith('/users/me')) return true;
  if (p.startsWith('/users/profile-photo')) return true;
  if (/^\/employees\/\d+(\/first-login)?$/.test(p)) return true;
  if (p.startsWith('/users/org-tree')) return true;
  if (p.startsWith('/users/org-directory')) return true;
  if (p.startsWith('/org-chart/')) return true;
  if (p.startsWith('/auth/change-password')) return true;
  if (p === '/policies' && method === 'GET') return true;
  if (p.startsWith('/policies/chat')) return true;
  if (p.startsWith('/employee-documents')) return true;
  if (p.startsWith('/exit')) return true;
  if (p.startsWith('/payroll')) return true;
  if (p.startsWith('/performance')) return true;
  return false;
}

async function enforceOnboardingComplete(req, res, next) {
  if (!req.user?.id) return next();
  if (req.user.adminId) return next();

  const role = String(req.user.role || '').toLowerCase().trim();
  if (role !== 'employee') return next();

  if (isOnboardingWhitelisted(req.path, req.method)) return next();

  try {
    const { rows } = await pool.query(
      'SELECT onboarding_completed FROM employees WHERE id = $1 LIMIT 1',
      [req.user.id]
    );
    if (rows[0]?.onboarding_completed === true) return next();

    return res.status(403).json({
      message: 'Complete your onboarding before accessing this feature',
      code: 'ONBOARDING_REQUIRED',
      onboardingRequired: true,
    });
  } catch (err) {
    console.error('Onboarding gate check failed:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = { enforceOnboardingComplete, isOnboardingWhitelisted };
