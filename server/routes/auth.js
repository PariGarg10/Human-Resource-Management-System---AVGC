const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { loadAdminPermissions, ALL_MODULES } = require('../utils/adminPermissions');
const { generateEmployeeCode } = require('../utils/employeeCode');
const {
  requestPasswordReset,
  resetPasswordWithToken,
  validatePasswordStrength,
} = require('../utils/passwordReset');

async function verifyCurrentPassword(req, currentPassword) {
  if (req.user.adminId) {
    const adminResult = await pool.query('SELECT passwordhash FROM admins WHERE id = $1', [req.user.adminId]);
    const admin = adminResult.rows[0];
    if (admin?.passwordhash && bcrypt.compareSync(currentPassword, admin.passwordhash)) {
      return true;
    }
  }
  const userResult = await pool.query('SELECT passwordhash FROM employees WHERE id = $1', [req.user.id]);
  const employee = userResult.rows[0];
  return Boolean(employee?.passwordhash && bcrypt.compareSync(currentPassword, employee.passwordhash));
}

const router = express.Router();

function isFounderEmployee(employee) {
  const role = String(employee?.role || '').toLowerCase().trim();
  const name = String(employee?.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return role === 'founder' || name === 'ashish mishra';
}

async function issueLogin(res, email, password, allowedRole) {
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const loginId = String(email || '').trim();
  const result = await pool.query(
    `
      SELECT id, employeecode, name, email, passwordhash, role, department, mustchangepassword
      FROM employees
      WHERE lower(trim(email)) = lower($1)
         OR upper(trim(employeecode)) = upper($1)
    `,
    [loginId]
  );
  const employee = result.rows[0];

  if (!employee || !bcrypt.compareSync(password, employee.passwordhash)) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const role = String(employee.role || 'employee').toLowerCase().trim();
  const expectedRole = String(allowedRole || '').toLowerCase().trim();
  const founderCanUseAdminLogin = expectedRole === 'admin' && isFounderEmployee(employee);
  if (allowedRole && role !== expectedRole && !founderCanUseAdminLogin) {
    return res.status(403).json({ message: `This login is only for ${allowedRole}` });
  }

  const payload = {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    role,
    mustchangepassword: Boolean(employee.mustchangepassword),
  };
  if (role !== 'employee') {
    payload.employeecode = employee.employeecode;
  }

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

  const baseEmployee = {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    department: employee.department,
    role,
    mustchangepassword: Boolean(employee.mustchangepassword),
  };
  if (role !== 'employee') {
    baseEmployee.employeecode = employee.employeecode;
  }

  return res.json({
    token,
    employee: baseEmployee,
  });
}

async function issueAdminLogin(res, email, password) {
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const loginId = String(email).trim();
  const adminResult = await pool.query(
    `
      SELECT id, name, email, passwordhash, designation, department, is_super_admin, is_active,
             employee_id, mustchangepassword
      FROM admins
      WHERE lower(trim(email)) = lower($1)
    `,
    [loginId]
  );
  const admin = adminResult.rows[0];

  if (admin) {
    if (!admin.is_active) {
      return res.status(403).json({ message: 'This admin account is deactivated' });
    }
    if (!bcrypt.compareSync(password, admin.passwordhash)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const permissions = admin.is_super_admin
      ? ALL_MODULES
      : await loadAdminPermissions(pool, admin.id);

    let employeeId = admin.employee_id;
    if (!employeeId) {
      const employeecode = await generateEmployeeCode();
      const empInsert = await pool.query(
        `
          INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
          VALUES ($1, $2, $3, $4, $5, 'admin', TRUE, $6)
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
      employeeId = empInsert.rows[0].id;
      await pool.query('UPDATE admins SET employee_id = $1 WHERE id = $2', [employeeId, admin.id]);
    }

    const payload = {
      id: employeeId,
      adminId: admin.id,
      name: admin.name,
      email: admin.email,
      role: 'admin',
      isSuperAdmin: Boolean(admin.is_super_admin),
      permissions,
      mustchangepassword: Boolean(admin.mustchangepassword),
      employeecode: null,
    };

    const empRow = await pool.query('SELECT employeecode, department FROM employees WHERE id = $1', [employeeId]);
    if (empRow.rows[0]) {
      payload.employeecode = empRow.rows[0].employeecode;
      payload.department = empRow.rows[0].department || admin.department;
    }

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    return res.json({
      token,
      employee: {
        id: employeeId,
        adminId: admin.id,
        name: admin.name,
        email: admin.email,
        department: payload.department || admin.department,
        role: 'admin',
        designation: admin.designation,
        isSuperAdmin: Boolean(admin.is_super_admin),
        permissions,
        mustchangepassword: Boolean(admin.mustchangepassword),
        employeecode: payload.employeecode,
      },
    });
  }

  return issueLogin(res, email, password, 'admin');
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const adminTry = await pool.query(
      'SELECT id FROM admins WHERE lower(trim(email)) = lower($1) AND is_active = TRUE',
      [String(email || '').trim()]
    );
    if (adminTry.rows[0]) {
      return await issueAdminLogin(res, email, password);
    }
    return await issueLogin(res, email, password, null);
  } catch (err) {
    console.error('POST /login:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/employee/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    return await issueLogin(res, email, password, 'employee');
  } catch (err) {
    console.error('POST /employee/login:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/manager/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    return await issueLogin(res, email, password, 'manager');
  } catch (err) {
    console.error('POST /manager/login:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    return await issueAdminLogin(res, email, password);
  } catch (err) {
    console.error('POST /admin/login:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/it-head/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    return await issueLogin(res, email, password, 'it_head');
  } catch (err) {
    console.error('POST /it-head/login:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }
  const existingResult = await pool.query(
      'SELECT id, isregistered, role, name, department FROM employees WHERE email = $1',
      [email.trim()]
    );
    const existingEmployee = existingResult.rows[0];

    if (!existingEmployee) {
      return res.status(404).json({ message: 'No pre-onboarded employee account found for this email' });
    }
    if (existingEmployee.role !== 'employee') {
      return res.status(403).json({ message: 'Only employee accounts can self-register' });
    }
    if (existingEmployee.isregistered) {
      return res.status(409).json({ message: 'Employee is already registered' });
    }

    const passwordhash = bcrypt.hashSync(password, 10);

    await pool.query(
      `
      UPDATE employees
      SET name = $1, passwordhash = $2, isregistered = TRUE, mustchangepassword = FALSE
      WHERE id = $3
    `,
      [name || existingEmployee.name, passwordhash, existingEmployee.id]
    );

    await logAudit(existingEmployee.id, 'REGISTER', 'auth', { email });
    return res.status(201).json({ message: 'Registration successful' });
  } catch (err) {
    console.error('POST /register:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'currentPassword and newPassword are required' });
    }

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      return res.status(400).json({ message: strengthError });
    }

    const currentValid = await verifyCurrentPassword(req, currentPassword);
    if (!currentValid) {
      return res.status(401).json({ message: 'Current password is invalid' });
    }

    const passwordhash = bcrypt.hashSync(newPassword, 10);
    await pool.query('UPDATE employees SET passwordhash = $1, mustchangepassword = FALSE WHERE id = $2', [
      passwordhash,
      req.user.id,
    ]);
    if (req.user.adminId) {
      await pool.query('UPDATE admins SET passwordhash = $1, mustchangepassword = FALSE WHERE id = $2', [
        passwordhash,
        req.user.adminId,
      ]);
    }
    await logAudit(req.user.id, 'PASSWORD_CHANGED', 'auth', null);

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('POST /change-password:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/logout', (_req, res) => {
  return res.json({ message: 'Logged out successfully' });
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !String(email).trim()) {
      return res.status(400).json({ message: 'email is required' });
    }

    const result = await requestPasswordReset(email);
    return res.status(200).json({ message: result.message });
  } catch (err) {
    console.error('POST /forgot-password:', err.message);
    return res.status(200).json({
      message: 'If this email exists, a reset link has been sent to your inbox',
    });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'token and newPassword are required' });
    }

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      return res.status(400).json({ message: strengthError });
    }

    const result = await resetPasswordWithToken(token, newPassword);
    if (!result.ok) {
      return res.status(400).json({ message: result.message, code: result.code });
    }

    return res.status(200).json({ message: result.message });
  } catch (err) {
    console.error('POST /reset-password:', err.message);
    return res.status(400).json({
      message: 'This link is invalid or has expired. Please request a new one.',
      code: 'INVALID',
    });
  }
});

module.exports = router;
