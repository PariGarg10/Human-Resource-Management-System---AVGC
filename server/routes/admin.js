const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { format } = require('date-fns');
const { db } = require('../db');
const { authMiddleware, requireRoles, enforcePasswordChange } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { getAttendanceStatus } = require('../utils/attendance');
const { generateEmployeeCode } = require('../utils/employeeCode');
const { getEffectiveAttendanceStatus } = require('../utils/attendanceView');
const { filterUpcomingBirthdays } = require('../utils/birthdays');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

router.use(authMiddleware);
router.use(enforcePasswordChange);
router.use(requireRoles('admin'));

router.post('/employees', (req, res) => {
  const { name, email, password, department, role } = req.body;

  if (!name || !email) {
    return res.status(400).json({ message: 'name and email are required' });
  }

  const normalizedRole = ['employee', 'manager', 'admin'].includes(role) ? role : 'employee';
  if ((normalizedRole === 'employee' || normalizedRole === 'manager') && !email.toLowerCase().endsWith('@gmail.com')) {
    return res.status(400).json({ message: 'Employee/Manager email must end with @gmail.com' });
  }
  if (normalizedRole === 'manager' && !password) {
    return res.status(400).json({ message: 'Manager password is required' });
  }

  const generatedCode = generateEmployeeCode();
  const isEmployee = normalizedRole === 'employee';
  const isRegistered = isEmployee ? 0 : 1;
  const passwordhash = bcrypt.hashSync(password || `Temp@${Date.now()}_${generatedCode}`, 10);

  try {
    const result = db
      .prepare(`
        INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(generatedCode, name, email, passwordhash, department || null, normalizedRole, isRegistered, isEmployee ? 0 : 0);

    logAudit(req.user.id, 'EMPLOYEE_CREATED', 'employees', { employeecode: generatedCode, role: normalizedRole });

    return res.status(201).json({
      id: result.lastInsertRowid,
      name,
      email,
      department: department || null,
      role: normalizedRole,
      isregistered: Boolean(isRegistered),
      employeecode: generatedCode
    });
  } catch (error) {
    return res.status(409).json({ message: 'Employee with same code or email already exists' });
  }
});

router.get('/employees', (_req, res) => {
  const employees = db
    .prepare('SELECT id, employeecode, name, email, department, role, isregistered, createdat FROM employees ORDER BY id ASC')
    .all();

  return res.json({ employees });
});

router.get('/upcoming-birthdays', (_req, res) => {
  const rows = db
    .prepare(
      `
      SELECT id, name, email, department, dateofbirth
      FROM employees
      WHERE dateofbirth IS NOT NULL AND trim(dateofbirth) != ''
    `
    )
    .all();
  const upcoming = filterUpcomingBirthdays(rows, new Date(), 7).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    department: r.department,
    dateOfBirth: r.dateofbirth,
    nextBirthday: r.nextBirthday,
    daysUntil: r.daysUntil,
  }));
  return res.json({ upcoming });
});

router.get('/attendance/daily', (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ message: 'date query parameter is required (YYYY-MM-DD)' });
  }

  const rows = db
    .prepare(`
      SELECT e.id as employeeid, e.employeecode, e.name, e.department, a.date, a.punchin, a.punchout, a.totalhours, COALESCE(a.status, 'absent') as status
      FROM employees e
      LEFT JOIN attendancelogs a ON a.employeeid = e.id AND a.date = ?
      ORDER BY e.id ASC
    `)
    .all(date);

  const records = rows.map((row) => {
    const leave = db.prepare(`
      SELECT 1 FROM leaves
      WHERE employeeid = ? AND status = 'approved' AND ? BETWEEN fromdate AND todate
      LIMIT 1
    `).get(row.employeeid, date);

    return {
      ...row,
      status: getEffectiveAttendanceStatus({
        totalhours: row.totalhours,
        status: row.status,
        hasApprovedLeave: Boolean(leave)
      })
    };
  });

  return res.json({ date, records });
});

router.post('/managers', (req, res) => {
  const { name, email, password, department } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email, and password are required' });
  }
  if (!email.toLowerCase().endsWith('@gmail.com')) {
    return res.status(400).json({ message: 'Manager email must end with @gmail.com' });
  }

  try {
    const generatedCode = generateEmployeeCode();
    const passwordhash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
      VALUES (?, ?, ?, ?, ?, 'manager', 1, 0)
    `).run(generatedCode, name, email, passwordhash, department || null);

    logAudit(req.user.id, 'MANAGER_CREATED', 'employees', { employeecode: generatedCode });
    return res.status(201).json({ id: result.lastInsertRowid, employeecode: generatedCode, name, email, role: 'manager' });
  } catch (_error) {
    return res.status(409).json({ message: 'Manager with same code or email already exists' });
  }
});

router.delete('/managers/:id', (req, res) => {
  const managerId = Number(req.params.id);
  const manager = db.prepare("SELECT id, role FROM employees WHERE id = ?").get(managerId);
  if (!manager || manager.role !== 'manager') {
    return res.status(404).json({ message: 'Manager not found' });
  }
  db.prepare('DELETE FROM manageremployees WHERE managerid = ?').run(managerId);
  db.prepare('DELETE FROM employees WHERE id = ?').run(managerId);
  logAudit(req.user.id, 'MANAGER_DELETED', 'employees', { managerId });
  return res.json({ message: 'Manager deleted successfully' });
});

router.post('/manager-assignments', (req, res) => {
  const { managerid, employeeid } = req.body;
  if (!managerid || !employeeid) {
    return res.status(400).json({ message: 'managerid and employeeid are required' });
  }

  const manager = db.prepare("SELECT id FROM employees WHERE id = ? AND role = 'manager'").get(managerid);
  const employee = db.prepare("SELECT id FROM employees WHERE id = ? AND role = 'employee'").get(employeeid);
  if (!manager || !employee) {
    return res.status(404).json({ message: 'Manager or employee not found' });
  }

  db.prepare('DELETE FROM manageremployees WHERE employeeid = ?').run(employeeid);
  db.prepare('INSERT INTO manageremployees (managerid, employeeid) VALUES (?, ?)').run(managerid, employeeid);
  logAudit(req.user.id, 'MANAGER_ASSIGNED', 'manageremployees', { managerid, employeeid });
  return res.json({ message: 'Employee assigned to manager' });
});

router.post('/manager-assignments/bulk', (req, res) => {
  const { managerid, employeeids } = req.body;
  if (!managerid || !Array.isArray(employeeids)) {
    return res.status(400).json({ message: 'managerid and employeeids[] are required' });
  }

  const manager = db.prepare("SELECT id FROM employees WHERE id = ? AND role = 'manager'").get(managerid);
  if (!manager) return res.status(404).json({ message: 'Manager not found' });

  const summary = { total: employeeids.length, assigned: 0, failed: 0, errors: [] };
  for (const employeeid of employeeids) {
    try {
      const employee = db.prepare("SELECT id FROM employees WHERE id = ? AND role = 'employee'").get(employeeid);
      if (!employee) throw new Error('Employee not found');
      db.prepare('DELETE FROM manageremployees WHERE employeeid = ?').run(employeeid);
      db.prepare('INSERT INTO manageremployees (managerid, employeeid) VALUES (?, ?)').run(managerid, employeeid);
      summary.assigned += 1;
    } catch (error) {
      summary.failed += 1;
      summary.errors.push({ employeeid, error: error.message || 'Assignment failed' });
    }
  }

  return res.json(summary);
});

router.get('/manager-assignments', (req, res) => {
  const { department, search } = req.query;
  let query = `
    SELECT e.id as employeeid, e.name as employeename, e.email as employeeemail, e.department,
           m.id as managerid, m.name as managername, m.email as manageremail
    FROM employees e
    LEFT JOIN manageremployees me ON me.employeeid = e.id
    LEFT JOIN employees m ON m.id = me.managerid
    WHERE e.role = 'employee'
  `;
  const params = [];

  if (department) {
    query += ' AND e.department = ?';
    params.push(department);
  }
  if (search) {
    query += ' AND (e.name LIKE ? OR e.email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY e.name ASC';

  const assignments = db.prepare(query).all(...params);
  const managers = db.prepare("SELECT id, employeecode, name, email, department FROM employees WHERE role = 'manager' ORDER BY name").all();

  return res.json({ assignments, managers });
});

router.delete('/manager-assignments/:employeeid', (req, res) => {
  const employeeid = Number(req.params.employeeid);
  db.prepare('DELETE FROM manageremployees WHERE employeeid = ?').run(employeeid);
  logAudit(req.user.id, 'MANAGER_UNASSIGNED', 'manageremployees', { employeeid });
  return res.json({ message: 'Manager assignment removed' });
});

router.get('/leaves', (req, res) => {
  const status = req.query.status;
  let query = `
    SELECT l.*, e.employeecode, e.name, e.department
    FROM leaves l
    JOIN employees e ON e.id = l.employeeid
  `;
  const params = [];

  if (status) {
    query += ' WHERE l.status = ?';
    params.push(status);
  }
  query += ' ORDER BY l.createdat DESC';

  const leaves = db.prepare(query).all(...params);
  return res.json({ leaves });
});

router.put('/leaves/:id/approve', (req, res) => {
  const leaveId = Number(req.params.id);
  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId);
  if (!leave) return res.status(404).json({ message: 'Leave not found' });
  if (leave.status !== 'pending') return res.status(400).json({ message: 'Leave already processed' });

  db.prepare("UPDATE leaves SET status = 'approved', approvedby = ? WHERE id = ?").run(req.user.id, leaveId);

  const from = new Date(leave.fromdate);
  const to = new Date(leave.todate);
  for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
    const date = format(day, 'yyyy-MM-dd');
    const existing = db.prepare('SELECT * FROM attendancelogs WHERE employeeid = ? AND date = ?').get(leave.employeeid, date);
    if (!existing) {
      db.prepare('INSERT INTO attendancelogs (employeeid, date, status, totalhours) VALUES (?, ?, ?, ?)').run(
        leave.employeeid,
        date,
        'leave',
        0
      );
    } else if ((existing.totalhours ?? 0) < 4) {
      db.prepare("UPDATE attendancelogs SET status = 'leave', totalhours = 0 WHERE id = ?").run(existing.id);
    }
  }

  logAudit(req.user.id, 'LEAVE_APPROVED', 'leaves', { leaveId });
  return res.json({ message: 'Leave approved' });
});

router.put('/leaves/:id/reject', (req, res) => {
  const leaveId = Number(req.params.id);
  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId);
  if (!leave) return res.status(404).json({ message: 'Leave not found' });
  if (leave.status !== 'pending') return res.status(400).json({ message: 'Leave already processed' });

  db.prepare("UPDATE leaves SET status = 'rejected', approvedby = ? WHERE id = ?").run(req.user.id, leaveId);
  logAudit(req.user.id, 'LEAVE_REJECTED', 'leaves', { leaveId });
  return res.json({ message: 'Leave rejected' });
});

router.post('/import-attendance', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Attendance file is required' });
  }

  let rows = [];
  try {
    const workbook = XLSX.readFile(req.file.path);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
  } catch (_error) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: 'Unable to parse attendance file' });
  }

  const summary = {
    totalrows: rows.length,
    successfulimports: 0,
    failedrows: 0,
    errors: []
  };

  const insertImport = db.prepare(`
    INSERT INTO importhistory (filename, totalrows, successfulrows, failedrows, createdby)
    VALUES (?, ?, ?, ?, ?)
  `);
  const importResult = insertImport.run(req.file.originalname, rows.length, 0, 0, req.user.id);
  const importId = Number(importResult.lastInsertRowid);

  const insertError = db.prepare(`
    INSERT INTO importerrors (importid, rownumber, error, rowdata)
    VALUES (?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNum = i + 2;
    try {
      const employeecode = String(row['Employee Code'] || '').trim();
      const date = String(row.Date || '').trim();
      const punchIn = row['Punch In'] ? new Date(row['Punch In']) : null;
      const punchOut = row['Punch Out'] ? new Date(row['Punch Out']) : null;
      const totalHours = row['Total Hours'] === '' ? null : Number(row['Total Hours']);
      const statusInput = String(row.Status || '').toLowerCase().trim();

      if (!employeecode || !date) {
        throw new Error('Employee Code and Date are required');
      }

      const employee = db.prepare('SELECT id FROM employees WHERE employeecode = ?').get(employeecode);
      if (!employee) throw new Error('Employee not found');

      let status = statusInput;
      if (!['present', 'halfday', 'absent', 'leave'].includes(status)) {
        status = getAttendanceStatus(totalHours);
      }

      db.prepare(`
        INSERT INTO attendancelogs (employeeid, date, punchin, punchout, totalhours, status)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(employeeid, date) DO UPDATE SET
          punchin = excluded.punchin,
          punchout = excluded.punchout,
          totalhours = excluded.totalhours,
          status = excluded.status
      `).run(
        employee.id,
        date,
        punchIn && !Number.isNaN(punchIn.getTime()) ? punchIn.toISOString() : null,
        punchOut && !Number.isNaN(punchOut.getTime()) ? punchOut.toISOString() : null,
        Number.isNaN(totalHours) ? null : totalHours,
        status
      );
      summary.successfulimports += 1;
    } catch (error) {
      summary.failedrows += 1;
      const msg = error.message || 'Invalid row';
      summary.errors.push({ row: rowNum, error: msg });
      insertError.run(importId, rowNum, msg, JSON.stringify(row));
    }
  }

  db.prepare('UPDATE importhistory SET successfulrows = ?, failedrows = ? WHERE id = ?').run(
    summary.successfulimports,
    summary.failedrows,
    importId
  );
  fs.unlink(req.file.path, () => {});
  logAudit(req.user.id, 'ATTENDANCE_IMPORTED', 'importhistory', {
    importId,
    file: req.file.originalname,
    ...summary
  });

  return res.json({ importid: importId, ...summary });
});

router.post('/import-employees', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Employee file is required' });

  let rows = [];
  try {
    const workbook = XLSX.readFile(req.file.path);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
  } catch (_error) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: 'Unable to parse employee import file' });
  }

  const summary = { totalrows: rows.length, successfulimports: 0, failedrows: 0, errors: [] };
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNum = i + 2;
    try {
      const name = String(row.Name || '').trim();
      const email = String(row.Email || '').trim().toLowerCase();
      const department = String(row.Department || '').trim() || null;
      const managerEmail = String(row.ManagerEmail || '').trim().toLowerCase();
      if (!name || !email) throw new Error('Name and Email are required');
      if (!email.endsWith('@gmail.com')) throw new Error('Email must end with @gmail.com');
      if (db.prepare('SELECT id FROM employees WHERE email = ?').get(email)) {
        throw new Error('Duplicate Gmail');
      }

      const code = generateEmployeeCode();
      const pwd = bcrypt.hashSync(`Temp@${Date.now()}_${code}`, 10);
      const result = db.prepare(`
        INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
        VALUES (?, ?, ?, ?, ?, 'employee', 0, 0)
      `).run(code, name, email, pwd, department);

      if (managerEmail) {
        const manager = db.prepare("SELECT id FROM employees WHERE email = ? AND role = 'manager'").get(managerEmail);
        if (!manager) throw new Error(`Manager not found for email: ${managerEmail}`);
        db.prepare('INSERT OR IGNORE INTO manageremployees (managerid, employeeid) VALUES (?, ?)')
          .run(manager.id, result.lastInsertRowid);
      }

      summary.successfulimports += 1;
    } catch (error) {
      summary.failedrows += 1;
      summary.errors.push({ row: rowNum, error: error.message || 'Invalid row' });
    }
  }

  fs.unlink(req.file.path, () => {});
  return res.json(summary);
});

router.get('/import-history', (_req, res) => {
  const history = db.prepare('SELECT * FROM importhistory ORDER BY createdat DESC').all();
  return res.json({ history });
});

module.exports = router;
