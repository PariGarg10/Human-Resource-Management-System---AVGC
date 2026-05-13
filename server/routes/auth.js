const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

function issueLogin(res, email, password, allowedRole) {
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const employee = db
    .prepare(`
      SELECT id, employeecode, name, email, passwordhash, role, department, mustchangepassword
      FROM employees
      WHERE email = ?
    `)
    .get(email.trim());

  if (!employee || !bcrypt.compareSync(password, employee.passwordhash)) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  if (allowedRole && employee.role !== allowedRole) {
    return res.status(403).json({ message: `This login is only for ${allowedRole}` });
  }

  const payload = {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    role: employee.role || 'employee',
    mustchangepassword: Boolean(employee.mustchangepassword)
  };
  if (employee.role !== 'employee') {
    payload.employeecode = employee.employeecode;
  }

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

  const baseEmployee = {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    department: employee.department,
    role: employee.role || 'employee',
    mustchangepassword: Boolean(employee.mustchangepassword)
  };
  if (employee.role !== 'employee') {
    baseEmployee.employeecode = employee.employeecode;
  }

  return res.json({
    token,
    employee: baseEmployee
  });
}

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  return issueLogin(res, email, password, null);
});

router.post('/employee/login', (req, res) => {
  const { email, password } = req.body;
  return issueLogin(res, email, password, 'employee');
});

router.post('/manager/login', (req, res) => {
  const { email, password } = req.body;
  return issueLogin(res, email, password, 'manager');
});

router.post('/admin/login', (req, res) => {
  const { email, password } = req.body;
  return issueLogin(res, email, password, 'admin');
});

router.post('/register', (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }
  if (!email.toLowerCase().endsWith('@gmail.com')) {
    return res.status(400).json({ message: 'Employee registration requires a Gmail address' });
  }

  const existingEmployee = db
    .prepare('SELECT id, isregistered, role, name, department FROM employees WHERE email = ?')
    .get(email.trim());

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

  db.prepare(`
    UPDATE employees
    SET name = ?, passwordhash = ?, isregistered = 1, mustchangepassword = 0
    WHERE id = ?
  `).run(name || existingEmployee.name, passwordhash, existingEmployee.id);

  logAudit(existingEmployee.id, 'REGISTER', 'auth', { email });
  return res.status(201).json({ message: 'Registration successful' });
});

router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'currentPassword and newPassword are required' });
  }

  const user = db.prepare('SELECT id, passwordhash FROM employees WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.passwordhash)) {
    return res.status(401).json({ message: 'Current password is invalid' });
  }

  const passwordhash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE employees SET passwordhash = ?, mustchangepassword = 0 WHERE id = ?').run(passwordhash, req.user.id);
  logAudit(req.user.id, 'PASSWORD_CHANGED', 'auth', null);

  return res.json({ message: 'Password updated successfully' });
});

router.post('/logout', (_req, res) => {
  return res.json({ message: 'Logged out successfully' });
});

router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'email is required' });
  const employee = db.prepare('SELECT id FROM employees WHERE email = ?').get(email.trim());
  if (!employee) {
    return res.json({ message: 'If account exists, password reset instructions are generated.' });
  }

  const tempPassword = `Tmp@${crypto.randomBytes(4).toString('hex')}`;
  const passwordhash = bcrypt.hashSync(tempPassword, 10);
  db.prepare('UPDATE employees SET passwordhash = ?, mustchangepassword = 1 WHERE id = ?')
    .run(passwordhash, employee.id);
  logAudit(employee.id, 'FORGOT_PASSWORD', 'auth', null);

  return res.json({
    message: 'Temporary password generated. Change password after login.',
    temporarypassword: tempPassword
  });
});

module.exports = router;
