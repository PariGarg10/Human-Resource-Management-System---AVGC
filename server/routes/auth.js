const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

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

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
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
    return await issueLogin(res, email, password, 'admin');
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

    const userResult = await pool.query('SELECT id, passwordhash FROM employees WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];
    if (!user || !bcrypt.compareSync(currentPassword, user.passwordhash)) {
      return res.status(401).json({ message: 'Current password is invalid' });
    }

    const passwordhash = bcrypt.hashSync(newPassword, 10);
    await pool.query('UPDATE employees SET passwordhash = $1, mustchangepassword = FALSE WHERE id = $2', [
      passwordhash,
      req.user.id,
    ]);
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
    if (!email) return res.status(400).json({ message: 'email is required' });
    const employeeResult = await pool.query('SELECT id FROM employees WHERE email = $1', [email.trim()]);
    const employee = employeeResult.rows[0];
    if (!employee) {
      return res.json({ message: 'If account exists, password reset instructions are generated.' });
    }

    const tempPassword = `Tmp@${crypto.randomBytes(4).toString('hex')}`;
    const passwordhash = bcrypt.hashSync(tempPassword, 10);
    await pool.query('UPDATE employees SET passwordhash = $1, mustchangepassword = TRUE WHERE id = $2', [
      passwordhash,
      employee.id,
    ]);
    await logAudit(employee.id, 'FORGOT_PASSWORD', 'auth', null);

    return res.json({
      message: 'Temporary password generated. Change password after login.',
      temporarypassword: tempPassword,
    });
  } catch (err) {
    console.error('POST /forgot-password:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
