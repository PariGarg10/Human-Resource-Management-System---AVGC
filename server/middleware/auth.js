const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token missing' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    return next();
  };
}

function enforcePasswordChange(req, res, next) {
  if (req.user && req.user.mustchangepassword && req.path !== '/change-password') {
    return res.status(403).json({
      message: 'Password change required before accessing this resource',
      requiresPasswordChange: true
    });
  }
  return next();
}

module.exports = { authMiddleware, requireRoles, enforcePasswordChange };
