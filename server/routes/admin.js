const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { getUploadsRoot } = require('../utils/storagePaths');
const { format } = require('date-fns');
const { pool } = require('../db');
const { authMiddleware, enforcePasswordChange } = require('../middleware/auth');
const { requireAdminAccess } = require('../middleware/adminAuth');
const { requirePermission, PERMISSION_MODULES } = require('../utils/adminPermissions');
const { logAudit } = require('../utils/audit');
const { calculateTotalHours, getAttendanceStatus } = require('../utils/attendance');
const { generateEmployeeCode } = require('../utils/employeeCode');
const { getEffectiveAttendanceStatus } = require('../utils/attendanceView');
const { filterUpcomingBirthdays } = require('../utils/birthdays');
const { getHolidayDatesSet, isHolidayDate } = require('../utils/holidaysRange');
const { createNotification } = require('../utils/notifications');
const { getLeaveBalance } = require('../utils/leaveBalance');
const {
  listEntitlements,
  createEntitlement,
  updateEntitlement,
  deleteEntitlement,
} = require('../utils/leaveEntitlements');
const {
  parseAttendanceRow,
  normalizePersonName,
  normalizeImportDate,
  readAttendanceRowsFromFile,
} = require('../utils/attendanceImport');

const router = express.Router();
const uploadDir = getUploadsRoot();
const upload = multer({ dest: uploadDir });

const {
  parseEmployeeImportFile,
  normalizeImportedRole,
  isJunkRow,
  validateEmployeeRows,
} = require('../utils/employeeImport');

router.use(authMiddleware);
router.use(enforcePasswordChange);
router.use(requireAdminAccess);

const EMPLOYEE_PORTAL_ROLES = new Set(['employee', 'manager']);

router.get('/session', (req, res) => {
  return res.json({
    isSuperAdmin: req.isSuperAdmin,
    permissions: req.adminPermissions,
    admin: {
      id: req.adminAccount?.id,
      name: req.adminAccount?.name,
      email: req.adminAccount?.email,
      designation: req.adminAccount?.designation,
      department: req.adminAccount?.department,
    },
  });
});

router.post('/employees', requirePermission(PERMISSION_MODULES.EMPLOYEE_MANAGEMENT), async (req, res) => {
  try {
    const { name, email, password, department, role, employeecode, designation } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'name and email are required' });
    }

    const normalizedRole = EMPLOYEE_PORTAL_ROLES.has(String(role || '').toLowerCase().trim())
      ? String(role).toLowerCase().trim()
      : 'employee';
    if (normalizedRole === 'manager' && !password) {
      return res.status(400).json({ message: 'Password is required for manager role' });
    }

    let code = String(employeecode || '')
      .trim()
      .toUpperCase();
    if (!code) {
      code = await generateEmployeeCode();
    } else if (!/^[A-Z0-9_-]+$/.test(code)) {
      return res.status(400).json({ message: 'Employee code may only contain letters, numbers, hyphen, and underscore' });
    }

    const designationValue = designation != null ? String(designation).trim() || null : null;
    const isRegistered = true;
    const passwordhash = bcrypt.hashSync(password || `Temp@${Date.now()}_${code}`, 10);

    const result = await pool.query(
      `
      INSERT INTO employees (employeecode, name, email, passwordhash, department, designation, role, isregistered, mustchangepassword)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `,
      [
        code,
        name,
        email,
        passwordhash,
        department || null,
        designationValue,
        normalizedRole,
        isRegistered,
        false,
      ]
    );

    await logAudit(req.user.id, 'EMPLOYEE_CREATED', 'employees', {
      employeecode: code,
      role: normalizedRole,
      designation: designationValue,
    });

    return res.status(201).json({
      id: result.rows[0].id,
      name,
      email,
      department: department || null,
      designation: designationValue,
      role: normalizedRole,
      isregistered: isRegistered,
      employeecode: code,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Employee with same code or email already exists' });
    }
    console.error('POST /admin/employees:', error.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/employees', requirePermission(PERMISSION_MODULES.EMPLOYEE_MANAGEMENT), async (_req, res) => {
  try {
    const { rows: employees } = await pool.query(
      'SELECT id, employeecode, name, email, department, designation, role, isregistered, createdat FROM employees ORDER BY id ASC'
    );
    return res.json({ employees });
  } catch (err) {
    console.error('GET /admin/employees:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/employees/:id', requirePermission(PERMISSION_MODULES.EMPLOYEE_MANAGEMENT), async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return res.status(400).json({ message: 'Valid employee id is required' });
    }
    if (employeeId === req.user.id) {
      return res.status(400).json({ message: 'You cannot remove your own account' });
    }

    const targetResult = await pool.query('SELECT id, name, email, role FROM employees WHERE id = $1', [employeeId]);
    const target = targetResult.rows[0];
    if (!target) return res.status(404).json({ message: 'Employee not found' });

    const adminResult = await pool.query(
      'SELECT id, is_super_admin FROM admins WHERE employee_id = $1',
      [employeeId]
    );
    const linkedAdmin = adminResult.rows[0];
    if (linkedAdmin?.is_super_admin) {
      return res.status(400).json({ message: 'Cannot remove a Super Admin account from here' });
    }

    await pool.query('DELETE FROM manageremployees WHERE managerid = $1 OR employeeid = $1', [employeeId]);
    if (linkedAdmin) {
      await pool.query('DELETE FROM admin_permissions WHERE admin_id = $1', [linkedAdmin.id]);
      await pool.query('DELETE FROM admins WHERE id = $1', [linkedAdmin.id]);
    }
    await pool.query('DELETE FROM employees WHERE id = $1', [employeeId]);

    await logAudit(req.user.id, 'EMPLOYEE_REMOVED', 'employees', {
      employeeId,
      email: target.email,
      role: target.role,
    });
    return res.json({ message: 'Employee removed successfully' });
  } catch (err) {
    console.error('DELETE /admin/employees/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/employees/:id/designation', requirePermission(PERMISSION_MODULES.EMPLOYEE_MANAGEMENT), async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return res.status(400).json({ message: 'Valid employee id is required' });
    }
    const designation =
      req.body.designation != null ? String(req.body.designation).trim() || null : null;

    const targetResult = await pool.query(
      'SELECT id, name, designation FROM employees WHERE id = $1',
      [employeeId]
    );
    const target = targetResult.rows[0];
    if (!target) return res.status(404).json({ message: 'Employee not found' });

    await pool.query('UPDATE employees SET designation = $1 WHERE id = $2', [designation, employeeId]);
    await logAudit(req.user.id, 'EMPLOYEE_DESIGNATION_UPDATED', 'employees', {
      employeeId,
      previousDesignation: target.designation,
      designation,
    });
    return res.json({
      message: 'Designation updated',
      employee: { ...target, designation },
    });
  } catch (err) {
    console.error('PATCH /admin/employees/:id/designation:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/employees/:id/role', requirePermission(PERMISSION_MODULES.ROLE_MANAGEMENT), async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    const role = String(req.body.role || '').replace(/\s+/g, ' ').trim();
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return res.status(400).json({ message: 'Valid employee id is required' });
    }
    const normalizedRole = String(role || '').toLowerCase().trim();
    if (!EMPLOYEE_PORTAL_ROLES.has(normalizedRole)) {
      return res.status(400).json({ message: 'Portal role must be employee or manager' });
    }

    const targetResult = await pool.query('SELECT id, name, role FROM employees WHERE id = $1', [employeeId]);
    const target = targetResult.rows[0];
    if (!target) return res.status(404).json({ message: 'Employee not found' });

    await pool.query('UPDATE employees SET role = $1 WHERE id = $2', [normalizedRole, employeeId]);
    await logAudit(req.user.id, 'EMPLOYEE_ROLE_UPDATED', 'employees', {
      employeeId,
      previousRole: target.role,
      role: normalizedRole,
    });
    return res.json({ message: 'Role updated', employee: { ...target, role: normalizedRole } });
  } catch (err) {
    console.error('PATCH /admin/employees/:id/role:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/upcoming-birthdays', requirePermission(PERMISSION_MODULES.DASHBOARD_OVERVIEW), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT id, name, email, department, dateofbirth
      FROM employees
      WHERE dateofbirth IS NOT NULL AND trim(dateofbirth) != ''
    `
    );
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
  } catch (err) {
    console.error('GET /admin/upcoming-birthdays:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/attendance/daily', requirePermission(PERMISSION_MODULES.ATTENDANCE), async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ message: 'date query parameter is required (YYYY-MM-DD)' });
    }

    const rowsResult = await pool.query(
      `
      SELECT e.id AS employeeid, e.employeecode, e.name, e.department, a.date, a.punchin, a.punchout, a.totalhours, COALESCE(a.status, 'absent') AS status
      FROM employees e
      LEFT JOIN attendancelogs a ON a.employeeid = e.id AND a.date = $1::date
      ORDER BY e.id ASC
    `,
      [date]
    );
    const isHoliday = await isHolidayDate(date);

    const records = [];
    for (const row of rowsResult.rows) {
      const leaveResult = await pool.query(
        `
        SELECT 1 FROM leaves
        WHERE employeeid = $1 AND status = 'approved' AND $2::date BETWEEN fromdate AND todate
        LIMIT 1
      `,
        [row.employeeid, date]
      );

      records.push({
        ...row,
        status: isHoliday
          ? 'holiday'
          : getEffectiveAttendanceStatus({
              totalhours: row.totalhours,
              status: row.status,
              hasApprovedLeave: leaveResult.rows.length > 0,
            }),
      });
    }

    return res.json({ date, records });
  } catch (err) {
    console.error('GET /admin/attendance/daily:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/attendance/essl-sync', requirePermission(PERMISSION_MODULES.ATTENDANCE), async (_req, res) => {
  try {
    const { runEsslAttendanceSync } = require('../jobs/esslAttendanceSync');
    const result = await runEsslAttendanceSync();
    return res.json(result);
  } catch (err) {
    console.error('POST /admin/attendance/essl-sync:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/attendance/essl-logs', requirePermission(PERMISSION_MODULES.ATTENDANCE), async (req, res) => {
  try {
    const range = reportDateRange(req.query);
    if (!range) return res.status(400).json({ message: 'Invalid from/to date range' });

    const { listEsslDeviceLogs } = require('../utils/deviceAttendance');
    const payload = await listEsslDeviceLogs({
      from: range.from,
      to: range.to,
      matched: req.query.matched,
      imported: req.query.imported,
      limit: req.query.limit,
    });
    return res.json({ from: range.from, to: range.to, ...payload });
  } catch (err) {
    console.error('GET /admin/attendance/essl-logs:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/attendance/essl-import', requirePermission(PERMISSION_MODULES.ATTENDANCE), async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const from = String(body.from || req.query?.from || '').slice(0, 10);
    const to = String(body.to || req.query?.to || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return res.status(400).json({ message: 'Valid from and to dates (YYYY-MM-DD) are required' });
    }

    const { importEsslLogsToAttendance } = require('../utils/deviceAttendance');
    const summary = await importEsslLogsToAttendance({
      from,
      to,
      onlyPending: body.onlyPending !== false,
      dayStart: process.env.ESSL_DAY_START,
      dayEnd: process.env.ESSL_DAY_END,
    });
    return res.json({
      message: 'Device punches imported into attendance',
      from,
      to,
      ...summary,
    });
  } catch (err) {
    console.error('POST /admin/attendance/essl-import:', err.message);
    return res.status(500).json({ message: err.message || 'Internal server error' });
  }
});

function reportDateRange(query) {
  const now = new Date();
  const year = Number(query.year) || now.getFullYear();
  const month = Number(query.month) || now.getMonth() + 1;
  const monthString = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const from = String(query.from || `${year}-${monthString}-01`).slice(0, 10);
  const to = String(query.to || `${year}-${monthString}-${String(lastDay).padStart(2, '0')}`).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return null;
  }
  return { from, to, month, year };
}

function statusCounts(rows) {
  return rows.reduce(
    (acc, row) => {
      const status = String(row.status || 'absent').toLowerCase();
      if (status === 'present') acc.present += 1;
      else if (status === 'halfday') acc.halfday += 1;
      else if (status === 'leave') acc.leave += 1;
      else if (status === 'holiday') acc.holiday += 1;
      else acc.absent += 1;
      return acc;
    },
    { present: 0, halfday: 0, leave: 0, absent: 0, holiday: 0 }
  );
}

router.get('/reports', requirePermission(PERMISSION_MODULES.REPORTS_EXPORT), async (req, res) => {
  try {
    const range = reportDateRange(req.query);
    if (!range) return res.status(400).json({ message: 'Valid from/to or month/year is required' });
    const { from, to, year } = range;
    const parsedEmployeeId = Number(req.query.employeeId || req.query.employeeid || '');
    const employeeFilterId = Number.isFinite(parsedEmployeeId) && parsedEmployeeId > 0 ? parsedEmployeeId : null;

    const attendanceResult = await pool.query(
      `
      SELECT e.id AS employeeid, e.employeecode, e.name, e.email, e.department,
             d.day::date::text AS date, a.punchin, a.punchout, a.totalhours,
             COALESCE(a.status, 'absent') AS status
      FROM employees e
      CROSS JOIN generate_series($1::date, $2::date, interval '1 day') d(day)
      LEFT JOIN attendancelogs a
        ON a.employeeid = e.id
       AND a.date = d.day::date
      WHERE COALESCE(e.isregistered, TRUE) = TRUE
        AND ($3::int IS NULL OR e.id = $3::int)
      ORDER BY e.name ASC, d.day ASC
    `,
      [from, to, employeeFilterId]
    );
    const attendanceRows = attendanceResult.rows.map((row) => ({
      employeeId: row.employeeid,
      code: row.employeecode,
      name: row.name,
      email: row.email,
      department: row.department || '',
      date: row.date,
      punchIn: row.punchin,
      punchOut: row.punchout,
      totalHours: row.totalhours,
      status: row.status,
    }));

    const employeeResult = await pool.query(
      `
      SELECT id, employeecode, name, email, department, role, isregistered, createdat
      FROM employees
      WHERE ($1::int IS NULL OR id = $1::int)
      ORDER BY name ASC
    `,
      [employeeFilterId]
    );
    const employees = employeeResult.rows;

    const leaveRows = [];
    for (const employee of employees) {
      const balance = await getLeaveBalance(employee.id, year);
      leaveRows.push({
        employeeId: employee.id,
        code: employee.employeecode,
        name: employee.name,
        department: employee.department || '',
        totalLeave: balance.totals.total,
        usedLeave: balance.totals.used,
        remainingLeave: balance.totals.remaining,
      });
    }

    const requestResult = await pool.query(
      `
      SELECT c.id, rb.name AS raised_by, rt.name AS raised_to, c.subject, c.priority, c.status,
             c.created_at, c.responded_at
      FROM concerns c
      JOIN employees rb ON rb.id = c.raised_by
      JOIN employees rt ON rt.id = c.raised_to
      WHERE c.created_at::date BETWEEN $1::date AND $2::date
      ORDER BY c.created_at DESC
    `,
      [from, to]
    );

    const leaveRecordsResult = await pool.query(
      `
      SELECT l.id, e.id AS employeeid, e.employeecode, e.name, e.department,
             l.leavetype, l.fromdate::text AS fromdate, l.todate::text AS todate,
             l.reason, l.status, l.approvedby, approver.name AS approved_by,
             l.createdat
      FROM leaves l
      JOIN employees e ON e.id = l.employeeid
      LEFT JOIN employees approver ON approver.id = l.approvedby
      WHERE l.todate >= $1::date
        AND l.fromdate <= $2::date
        AND ($3::int IS NULL OR e.id = $3::int)
      ORDER BY l.fromdate DESC, e.name ASC
    `,
      [from, to, employeeFilterId]
    );

    const leaveRecords = leaveRecordsResult.rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeid,
      code: row.employeecode,
      name: row.name,
      department: row.department || '',
      leaveType: row.leavetype,
      fromDate: row.fromdate,
      toDate: row.todate,
      reason: row.reason || '',
      status: row.status,
      approvedBy: row.approved_by || '',
      createdAt: row.createdat,
    }));

    const presentAbsent = Object.entries(statusCounts(attendanceRows)).map(([status, count]) => ({ status, count }));

    const byDepartment = new Map();
    for (const row of attendanceRows) {
      const key = row.department || 'Unassigned';
      if (!byDepartment.has(key)) byDepartment.set(key, { department: key, present: 0, halfday: 0, leave: 0, absent: 0, holiday: 0 });
      const bucket = byDepartment.get(key);
      const status = String(row.status || 'absent').toLowerCase();
      if (status === 'present') bucket.present += 1;
      else if (status === 'halfday') bucket.halfday += 1;
      else if (status === 'leave') bucket.leave += 1;
      else if (status === 'holiday') bucket.holiday += 1;
      else bucket.absent += 1;
    }

    const byEmployee = new Map();
    for (const row of attendanceRows) {
      if (!byEmployee.has(row.employeeId)) {
        byEmployee.set(row.employeeId, {
          employeeId: row.employeeId,
          code: row.code,
          name: row.name,
          department: row.department || '',
          present: 0,
          halfday: 0,
          leave: 0,
          absent: 0,
          holiday: 0,
          totalHours: 0,
        });
      }
      const bucket = byEmployee.get(row.employeeId);
      const status = String(row.status || 'absent').toLowerCase();
      if (status === 'present') bucket.present += 1;
      else if (status === 'halfday') bucket.halfday += 1;
      else if (status === 'leave') bucket.leave += 1;
      else if (status === 'holiday') bucket.holiday += 1;
      else bucket.absent += 1;
      bucket.totalHours += Number(row.totalHours || 0);
    }

    const combinedAttendanceLeave = attendanceRows.map((row) => {
      const matchingLeave = leaveRecords.find(
        (leave) =>
          leave.employeeId === row.employeeId &&
          row.date >= leave.fromDate &&
          row.date <= leave.toDate
      );
      return {
        ...row,
        leaveType: matchingLeave?.leaveType || '',
        leaveStatus: matchingLeave?.status || '',
        leaveReason: matchingLeave?.reason || '',
      };
    });

    const odResult = await pool.query(
      `
      SELECT c.id, rb.name AS raised_by, rt.name AS raised_to, c.subject, c.priority, c.status,
             c.created_at, c.responded_at
      FROM concerns c
      JOIN employees rb ON rb.id = c.raised_by
      JOIN employees rt ON rt.id = c.raised_to
      WHERE c.created_at::date BETWEEN $1::date AND $2::date
        AND (c.subject ILIKE '%od%' OR c.subject ILIKE '%on duty%' OR c.description ILIKE '%on duty%')
      ORDER BY c.created_at DESC
    `,
      [from, to]
    );

    return res.json({
      range,
      reports: {
        attendanceByEmployee: attendanceRows,
        allAttendanceRecords: attendanceRows,
        leaveTakenVsBalance: leaveRows,
        leaveRecords,
        combinedAttendanceLeave,
        employeeDirectory: employees.map((employee) => ({
          id: employee.id,
          code: employee.employeecode,
          name: employee.name,
          email: employee.email,
          department: employee.department || '',
          role: employee.role,
          registered: Boolean(employee.isregistered),
          createdAt: employee.createdat,
        })),
        allEmployeeData: employees.map((employee) => ({
          id: employee.id,
          code: employee.employeecode,
          name: employee.name,
          email: employee.email,
          department: employee.department || '',
          role: employee.role,
          registered: Boolean(employee.isregistered),
          createdAt: employee.createdat,
        })),
        requestStatus: requestResult.rows.map((row) => ({
          id: row.id,
          raisedBy: row.raised_by,
          raisedTo: row.raised_to,
          subject: row.subject,
          priority: row.priority,
          status: row.status,
          createdAt: row.created_at,
          respondedAt: row.responded_at,
        })),
        presentAbsent,
        departmentWise: Array.from(byDepartment.values()),
        monthlySummary: Array.from(byEmployee.values()),
        monthWiseAttendance: Array.from(byEmployee.values()),
        odApproval: odResult.rows.map((row) => ({
          id: row.id,
          raisedBy: row.raised_by,
          raisedTo: row.raised_to,
          subject: row.subject,
          priority: row.priority,
          status: row.status,
          createdAt: row.created_at,
          respondedAt: row.responded_at,
        })),
      },
    });
  } catch (err) {
    console.error('GET /admin/reports:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/managers', requirePermission(PERMISSION_MODULES.EMPLOYEE_MANAGEMENT), async (req, res) => {
  try {
    const { name, email, password, department } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, and password are required' });
    }
    const trimmedName = String(name).trim();
    const normalizedEmail = String(email).trim().toLowerCase();
    const passwordhash = bcrypt.hashSync(password, 10);
    const dept = department ? String(department).trim() : null;

    const existingResult = await pool.query(
      'SELECT id, employeecode, name, email, role FROM employees WHERE lower(trim(email)) = $1',
      [normalizedEmail]
    );
    const existing = existingResult.rows[0];

    if (existing) {
      if (existing.role === 'manager') {
        return res.status(409).json({ message: 'This user is already a manager' });
      }
      if (existing.role === 'admin' || existing.role === 'it_head') {
        return res.status(400).json({
          message: `Cannot promote a user with role "${existing.role}" from this form`,
        });
      }

      const updated = await pool.query(
        `
        UPDATE employees
        SET name = $1,
            passwordhash = $2,
            department = COALESCE($3, department),
            role = 'manager',
            isregistered = TRUE,
            mustchangepassword = FALSE
        WHERE id = $4
        RETURNING id, employeecode, email
      `,
        [trimmedName, passwordhash, dept, existing.id]
      );

      await logAudit(req.user.id, 'MANAGER_PROMOTED', 'employees', {
        employeecode: existing.employeecode,
        previousRole: existing.role,
      });
      return res.json({
        id: updated.rows[0].id,
        employeecode: updated.rows[0].employeecode,
        name: trimmedName,
        email: updated.rows[0].email,
        role: 'manager',
        promoted: true,
      });
    }

    const generatedCode = await generateEmployeeCode();
    const result = await pool.query(
      `
      INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
      VALUES ($1, $2, $3, $4, $5, 'manager', TRUE, FALSE)
      RETURNING id
    `,
      [generatedCode, trimmedName, normalizedEmail, passwordhash, dept]
    );

    await logAudit(req.user.id, 'MANAGER_CREATED', 'employees', { employeecode: generatedCode });
    return res.status(201).json({
      id: result.rows[0].id,
      employeecode: generatedCode,
      name: trimmedName,
      email: normalizedEmail,
      role: 'manager',
      promoted: false,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        message: 'A user with this email or employee code already exists. Use the same email to promote an existing employee.',
      });
    }
    console.error('POST /admin/managers:', error.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/managers/:id', requirePermission(PERMISSION_MODULES.EMPLOYEE_MANAGEMENT), async (req, res) => {
  try {
    const managerId = Number(req.params.id);
    const managerResult = await pool.query('SELECT id, role FROM employees WHERE id = $1', [managerId]);
    const manager = managerResult.rows[0];
    if (!manager || manager.role !== 'manager') {
      return res.status(404).json({ message: 'Manager not found' });
    }
    await pool.query('DELETE FROM manageremployees WHERE managerid = $1', [managerId]);
    await pool.query('DELETE FROM employees WHERE id = $1', [managerId]);
    await logAudit(req.user.id, 'MANAGER_DELETED', 'employees', { managerId });
    return res.json({ message: 'Manager deleted successfully' });
  } catch (err) {
    console.error('DELETE /admin/managers/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/manager-assignments', requirePermission(PERMISSION_MODULES.EMPLOYEE_MANAGEMENT), async (req, res) => {
  try {
    const { managerid, employeeid } = req.body;
    if (!managerid || !employeeid) {
      return res.status(400).json({ message: 'managerid and employeeid are required' });
    }

    const managerResult = await pool.query("SELECT id FROM employees WHERE id = $1 AND role = 'manager'", [managerid]);
    const employeeResult = await pool.query("SELECT id FROM employees WHERE id = $1 AND role = 'employee'", [employeeid]);
    if (!managerResult.rows[0] || !employeeResult.rows[0]) {
      return res.status(404).json({ message: 'Manager or employee not found' });
    }

    await pool.query('DELETE FROM manageremployees WHERE employeeid = $1', [employeeid]);
    await pool.query('INSERT INTO manageremployees (managerid, employeeid) VALUES ($1, $2)', [managerid, employeeid]);
    await logAudit(req.user.id, 'MANAGER_ASSIGNED', 'manageremployees', { managerid, employeeid });
    return res.json({ message: 'Employee assigned to manager' });
  } catch (err) {
    console.error('POST /admin/manager-assignments:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/manager-assignments/bulk', requirePermission(PERMISSION_MODULES.EMPLOYEE_MANAGEMENT), async (req, res) => {
  try {
    const { managerid, employeeids } = req.body;
    if (!managerid || !Array.isArray(employeeids)) {
      return res.status(400).json({ message: 'managerid and employeeids[] are required' });
    }

    const managerResult = await pool.query("SELECT id FROM employees WHERE id = $1 AND role = 'manager'", [managerid]);
    if (!managerResult.rows[0]) return res.status(404).json({ message: 'Manager not found' });

    const summary = { total: employeeids.length, assigned: 0, failed: 0, errors: [] };
    for (const employeeid of employeeids) {
      try {
        const employeeResult = await pool.query("SELECT id FROM employees WHERE id = $1 AND role = 'employee'", [employeeid]);
        if (!employeeResult.rows[0]) throw new Error('Employee not found');
        await pool.query('DELETE FROM manageremployees WHERE employeeid = $1', [employeeid]);
        await pool.query('INSERT INTO manageremployees (managerid, employeeid) VALUES ($1, $2)', [managerid, employeeid]);
        summary.assigned += 1;
      } catch (error) {
        summary.failed += 1;
        summary.errors.push({ employeeid, error: error.message || 'Assignment failed' });
      }
    }

    return res.json(summary);
  } catch (err) {
    console.error('POST /admin/manager-assignments/bulk:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/manager-assignments', requirePermission(PERMISSION_MODULES.EMPLOYEE_MANAGEMENT), async (req, res) => {
  try {
    const { department, search } = req.query;
    let query = `
      SELECT e.id AS employeeid, e.name AS employeename, e.email AS employeeemail, e.department,
             m.id AS managerid, m.name AS managername, m.email AS manageremail
      FROM employees e
      LEFT JOIN manageremployees me ON me.employeeid = e.id
      LEFT JOIN employees m ON m.id = me.managerid
      WHERE e.role = 'employee'
    `;
    const params = [];
    let paramIndex = 1;

    if (department) {
      query += ` AND e.department = $${paramIndex}`;
      params.push(department);
      paramIndex += 1;
    }
    if (search) {
      query += ` AND (e.name ILIKE $${paramIndex} OR e.email ILIKE $${paramIndex + 1})`;
      params.push(`%${search}%`, `%${search}%`);
      paramIndex += 2;
    }
    query += ' ORDER BY e.name ASC';

    const assignmentsResult = await pool.query(query, params);
    const managersResult = await pool.query(
      "SELECT id, employeecode, name, email, department FROM employees WHERE role = 'manager' ORDER BY name"
    );

    return res.json({ assignments: assignmentsResult.rows, managers: managersResult.rows });
  } catch (err) {
    console.error('GET /admin/manager-assignments:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/manager-assignments/:employeeid', requirePermission(PERMISSION_MODULES.EMPLOYEE_MANAGEMENT), async (req, res) => {
  try {
    const employeeid = Number(req.params.employeeid);
    await pool.query('DELETE FROM manageremployees WHERE employeeid = $1', [employeeid]);
    await logAudit(req.user.id, 'MANAGER_UNASSIGNED', 'manageremployees', { employeeid });
    return res.json({ message: 'Manager assignment removed' });
  } catch (err) {
    console.error('DELETE /admin/manager-assignments:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/leave-entitlements', requirePermission(PERMISSION_MODULES.LEAVE_MANAGEMENT), async (req, res) => {
  try {
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    const entitlements = await listEntitlements({
      employeeId: Number.isFinite(employeeId) && employeeId > 0 ? employeeId : null,
      includeInactive: req.query.includeInactive === 'true',
    });
    return res.json({ entitlements });
  } catch (err) {
    console.error('GET /admin/leave-entitlements:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/leave-entitlements', requirePermission(PERMISSION_MODULES.LEAVE_MANAGEMENT), async (req, res) => {
  try {
    const entitlement = await createEntitlement(req.body, req.user.id);
    await logAudit(req.user.id, 'LEAVE_ENTITLEMENT_CREATED', 'leave_entitlements', {
      id: entitlement.id,
      leaveType: entitlement.leaveType,
      period: entitlement.period,
    });
    return res.status(201).json({ entitlement, message: 'Leave entitlement saved' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        message: 'An active entitlement with this type and period already exists for that scope',
      });
    }
    if (err.message && !err.code) {
      return res.status(400).json({ message: err.message });
    }
    console.error('POST /admin/leave-entitlements:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/leave-entitlements/:id', requirePermission(PERMISSION_MODULES.LEAVE_MANAGEMENT), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: 'Valid entitlement id is required' });
    }
    const entitlement = await updateEntitlement(id, req.body);
    await logAudit(req.user.id, 'LEAVE_ENTITLEMENT_UPDATED', 'leave_entitlements', { id });
    return res.json({ entitlement, message: 'Leave entitlement updated' });
  } catch (err) {
    if (err.message === 'Leave entitlement not found') {
      return res.status(404).json({ message: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({
        message: 'An active entitlement with this type and period already exists for that scope',
      });
    }
    if (err.message && !err.code) {
      return res.status(400).json({ message: err.message });
    }
    console.error('PUT /admin/leave-entitlements/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/leave-entitlements/:id', requirePermission(PERMISSION_MODULES.LEAVE_MANAGEMENT), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: 'Valid entitlement id is required' });
    }
    await deleteEntitlement(id);
    await logAudit(req.user.id, 'LEAVE_ENTITLEMENT_DELETED', 'leave_entitlements', { id });
    return res.json({ message: 'Leave entitlement removed' });
  } catch (err) {
    if (err.message === 'Leave entitlement not found') {
      return res.status(404).json({ message: err.message });
    }
    console.error('DELETE /admin/leave-entitlements/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/leaves', requirePermission(PERMISSION_MODULES.LEAVE_MANAGEMENT), async (req, res) => {
  try {
    const status = req.query.status;
    let query = `
      SELECT l.*, e.employeecode, e.name, e.department
      FROM leaves l
      JOIN employees e ON e.id = l.employeeid
    `;
    const params = [];

    if (status) {
      query += ' WHERE l.status = $1';
      params.push(status);
    }
    query += ' ORDER BY l.createdat DESC';

    const leavesResult = await pool.query(query, params);
    return res.json({ leaves: leavesResult.rows });
  } catch (err) {
    console.error('GET /admin/leaves:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/leaves/:id/approve', requirePermission(PERMISSION_MODULES.LEAVE_MANAGEMENT), async (req, res) => {
  try {
    const leaveId = Number(req.params.id);
    const leaveResult = await pool.query('SELECT * FROM leaves WHERE id = $1', [leaveId]);
    const leave = leaveResult.rows[0];
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    if (leave.status !== 'pending') return res.status(400).json({ message: 'Leave already processed' });

    await pool.query("UPDATE leaves SET status = 'approved', approvedby = $1 WHERE id = $2", [req.user.id, leaveId]);

    const holidayDates = await getHolidayDatesSet(
      format(new Date(leave.fromdate), 'yyyy-MM-dd'),
      format(new Date(leave.todate), 'yyyy-MM-dd')
    );

    const from = new Date(leave.fromdate);
    const to = new Date(leave.todate);
    for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
      const date = format(day, 'yyyy-MM-dd');
      if (holidayDates.has(date)) continue;
      const existingResult = await pool.query(
        'SELECT * FROM attendancelogs WHERE employeeid = $1 AND date = $2::date',
        [leave.employeeid, date]
      );
      const existing = existingResult.rows[0];
      if (!existing) {
        await pool.query(
          'INSERT INTO attendancelogs (employeeid, date, status, totalhours) VALUES ($1, $2::date, $3, $4)',
          [leave.employeeid, date, 'leave', 0]
        );
      } else if ((existing.totalhours ?? 0) < 4) {
        await pool.query("UPDATE attendancelogs SET status = 'leave', totalhours = 0 WHERE id = $1", [existing.id]);
      }
    }

    await logAudit(req.user.id, 'LEAVE_APPROVED', 'leaves', { leaveId });
    await createNotification(
      leave.employeeid,
      'leave_approved',
      `Your ${leave.leavetype} from ${leave.fromdate} to ${leave.todate} was approved.`,
      { subjectEmployeeId: req.user.id, eventDate: leave.fromdate }
    );
    return res.json({ message: 'Leave approved' });
  } catch (err) {
    console.error('PUT /admin/leaves/:id/approve:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/leaves/:id/reject', requirePermission(PERMISSION_MODULES.LEAVE_MANAGEMENT), async (req, res) => {
  try {
    const leaveId = Number(req.params.id);
    const leaveResult = await pool.query('SELECT * FROM leaves WHERE id = $1', [leaveId]);
    const leave = leaveResult.rows[0];
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    if (leave.status !== 'pending') return res.status(400).json({ message: 'Leave already processed' });

    await pool.query("UPDATE leaves SET status = 'rejected', approvedby = $1 WHERE id = $2", [req.user.id, leaveId]);
    await logAudit(req.user.id, 'LEAVE_REJECTED', 'leaves', { leaveId });
    await createNotification(
      leave.employeeid,
      'leave_rejected',
      `Your ${leave.leavetype} from ${leave.fromdate} to ${leave.todate} was rejected.`,
      { subjectEmployeeId: req.user.id, eventDate: leave.fromdate }
    );
    return res.json({ message: 'Leave rejected' });
  } catch (err) {
    console.error('PUT /admin/leaves/:id/reject:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

let importAttendanceRecordsReady = false;

async function ensureImportAttendanceRecordsTable() {
  if (importAttendanceRecordsReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_attendance_records (
      id SERIAL PRIMARY KEY,
      importid INTEGER NOT NULL REFERENCES importhistory(id) ON DELETE CASCADE,
      employeeid INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (importid, employeeid, date)
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_import_attendance_records_import ON import_attendance_records (importid)'
  );
  importAttendanceRecordsReady = true;
}

async function deleteImportedAttendanceByImportId(importId) {
  await ensureImportAttendanceRecordsTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const removed = await client.query(
      `
      DELETE FROM attendancelogs al
      USING import_attendance_records iar
      WHERE iar.importid = $1
        AND al.employeeid = iar.employeeid
        AND al.date = iar.date
    `,
      [importId]
    );
    const history = await client.query('DELETE FROM importhistory WHERE id = $1 RETURNING id', [importId]);
    await client.query('COMMIT');
    return {
      deleted: history.rowCount > 0,
      attendanceRowsRemoved: removed.rowCount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteAllImportedAttendance() {
  await ensureImportAttendanceRecordsTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const removed = await client.query(`
      DELETE FROM attendancelogs al
      USING import_attendance_records iar
      WHERE al.employeeid = iar.employeeid
        AND al.date = iar.date
    `);
    const history = await client.query('DELETE FROM importhistory RETURNING id');
    await client.query('COMMIT');
    return {
      importsRemoved: history.rowCount,
      attendanceRowsRemoved: removed.rowCount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

router.post('/import-attendance', requirePermission(PERMISSION_MODULES.IMPORT_DATA), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Attendance file is required' });
  }

  let rows = [];
  let headerRow = 1;
  try {
    const parsedFile = readAttendanceRowsFromFile(req.file.path);
    rows = parsedFile.rows;
    headerRow = parsedFile.headerRow;
  } catch (_error) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: _error.message || 'Unable to parse attendance file' });
  }

  const fallbackDate =
    normalizeImportDate(req.body?.attendanceDate) || format(new Date(), 'yyyy-MM-dd');

  try {
    await ensureImportAttendanceRecordsTable();
    const summary = {
      totalrows: rows.length,
      successfulimports: 0,
      skipped: 0,
      skippedDetails: [],
      failedrows: 0,
      errors: [],
    };

    const importResult = await pool.query(
      `
      INSERT INTO importhistory (filename, totalrows, successfulrows, failedrows, createdby)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `,
      [req.file.originalname, rows.length, 0, 0, req.user.id]
    );
    const importId = importResult.rows[0].id;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNum = headerRow + i + 1;
      try {
        const parsed = parseAttendanceRow(row, { fallbackDate });
        const { employeeName, employeecode, date, punchIn, punchOut, totalHours, statusInput } = parsed;

        if (!employeeName && !employeecode) {
          continue;
        }

        if (!date) {
          throw new Error(
            `Could not determine attendance date — set "Attendance date" above or use InTime with a full date (file default: ${fallbackDate})`
          );
        }

        let employeeResult;
        if (employeecode) {
          employeeResult = await pool.query('SELECT id, name FROM employees WHERE employeecode = $1', [
            employeecode,
          ]);
        } else {
          const normalizedName = normalizePersonName(employeeName);
          employeeResult = await pool.query(
            'SELECT id, name FROM employees WHERE lower(trim(name)) = lower($1)',
            [normalizedName]
          );
        }
        if (!employeeResult.rows[0]) {
          summary.skipped += 1;
          if (summary.skippedDetails.length < 30) {
            summary.skippedDetails.push({
              row: rowNum,
              name: employeeName || employeecode,
              reason: 'No matching employee in HRMS',
            });
          }
          continue;
        }

        let status = statusInput;
        if (totalHours != null && !Number.isNaN(totalHours)) {
          status = getAttendanceStatus(totalHours);
        } else if (!['present', 'halfday', 'absent', 'leave'].includes(status)) {
          const computed =
            punchIn && punchOut
              ? calculateTotalHours(punchIn.toISOString(), punchOut.toISOString())
              : null;
          status = getAttendanceStatus(computed);
        }

        const employeeId = employeeResult.rows[0].id;
        await pool.query(
          `
          INSERT INTO attendancelogs (employeeid, date, punchin, punchout, totalhours, status)
          VALUES ($1, $2::date, $3, $4, $5, $6)
          ON CONFLICT (employeeid, date) DO UPDATE SET
            punchin = EXCLUDED.punchin,
            punchout = EXCLUDED.punchout,
            totalhours = EXCLUDED.totalhours,
            status = EXCLUDED.status
        `,
          [
            employeeId,
            date,
            punchIn && !Number.isNaN(punchIn.getTime()) ? punchIn.toISOString() : null,
            punchOut && !Number.isNaN(punchOut.getTime()) ? punchOut.toISOString() : null,
            Number.isNaN(totalHours) ? null : totalHours,
            status,
          ]
        );
        await pool.query(
          `
          INSERT INTO import_attendance_records (importid, employeeid, date)
          VALUES ($1, $2, $3::date)
          ON CONFLICT (importid, employeeid, date) DO NOTHING
        `,
          [importId, employeeId, date]
        );
        summary.successfulimports += 1;
      } catch (error) {
        summary.failedrows += 1;
        const msg = error.message || 'Invalid row';
        summary.errors.push({ row: rowNum, error: msg });
        await pool.query(
          'INSERT INTO importerrors (importid, rownumber, error, rowdata) VALUES ($1, $2, $3, $4)',
          [importId, rowNum, msg, JSON.stringify(row)]
        );
      }
    }

    await pool.query('UPDATE importhistory SET successfulrows = $1, failedrows = $2 WHERE id = $3', [
      summary.successfulimports,
      summary.failedrows,
      importId,
    ]);
    fs.unlink(req.file.path, () => {});
    await logAudit(req.user.id, 'ATTENDANCE_IMPORTED', 'importhistory', {
      importId,
      file: req.file.originalname,
      ...summary,
    });

    return res.json({ importid: importId, attendanceDate: fallbackDate, ...summary });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error('POST /admin/import-attendance:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/import-employees', requirePermission(PERMISSION_MODULES.IMPORT_DATA), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Employee file is required' });

  let parsed;
  try {
    parsed = parseEmployeeImportFile(req.file.path);
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: error.message || 'Unable to parse employee import file' });
  }

  try {
    const rows = parsed.rows;
    const onDuplicate = String(req.body?.onDuplicate || req.query?.onDuplicate || 'skip').toLowerCase();
    const autoCode = req.body?.autoCode === true || req.body?.autoCode === 'true';

    const summary = {
      totalrows: rows.length,
      successfulimports: 0,
      updated: 0,
      skipped: 0,
      failedrows: 0,
      errors: [],
    };

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNum = row.rowNumber;
      try {
        if (isJunkRow(row)) continue;

        const name = row.name;
        const email = row.email;
        const role = normalizeImportedRole(row.role);
        let employeecode = row.employeecode;
        const department = row.department || null;

        if (!name || !email) {
          throw new Error('Name and Email are required');
        }
        if (!employeecode) {
          if (autoCode) {
            employeecode = await generateEmployeeCode();
          } else {
            throw new Error('Employee Code is required (or turn on auto-generate codes)');
          }
        }

        const emailCheck = await pool.query('SELECT id FROM employees WHERE email = $1', [email]);
        if (emailCheck.rows[0]) {
          if (onDuplicate === 'update') {
            const codeCheck = await pool.query(
              'SELECT id FROM employees WHERE employeecode = $1 AND id != $2',
              [employeecode, emailCheck.rows[0].id]
            );
            if (codeCheck.rows[0]) {
              throw new Error('Employee code already used by another person');
            }
            await pool.query(
              `
              UPDATE employees
              SET name = $1, employeecode = $2, role = $3, department = COALESCE($4, department)
              WHERE id = $5
            `,
              [name, employeecode, role, department, emailCheck.rows[0].id]
            );
            summary.updated += 1;
            continue;
          }
          if (onDuplicate === 'skip') {
            summary.skipped += 1;
            continue;
          }
          throw new Error('Duplicate email (already in HRMS)');
        }

        const codeCheck = await pool.query('SELECT id FROM employees WHERE employeecode = $1', [employeecode]);
        if (codeCheck.rows[0]) {
          throw new Error('Duplicate employee code');
        }

        const pwd = bcrypt.hashSync(`Temp@${Date.now()}_${employeecode}`, 10);
        await pool.query(
          `
          INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
          VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
        `,
          [employeecode, name, email, pwd, department, role, true]
        );

        summary.successfulimports += 1;
      } catch (error) {
        summary.failedrows += 1;
        summary.errors.push({ row: rowNum, error: error.message || 'Invalid row' });
      }
    }

    fs.unlink(req.file.path, () => {});
    return res.json(summary);
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error('POST /admin/import-employees:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/import-employees/preview', requirePermission(PERMISSION_MODULES.IMPORT_DATA), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Employee file is required' });

  try {
    const parsed = parseEmployeeImportFile(req.file.path);
    const validation = await validateEmployeeRows(pool, parsed.rows);
    fs.unlink(req.file.path, () => {});
    return res.json({
      totalrows: parsed.rows.length,
      mappedFields: parsed.mappedFields,
      newCount: validation.newCount,
      existingCount: validation.existingCount,
      invalidCount: validation.invalidCount,
      preview: validation.preview.slice(0, 50),
    });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: error.message || 'Unable to parse employee import file' });
  }
});

router.get('/import-history', requirePermission(PERMISSION_MODULES.IMPORT_DATA), async (_req, res) => {
  try {
    const { rows: history } = await pool.query('SELECT * FROM importhistory ORDER BY createdat DESC');
    return res.json({ history });
  } catch (err) {
    console.error('GET /admin/import-history:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/import-attendance/:importId', requirePermission(PERMISSION_MODULES.IMPORT_DATA), async (req, res) => {
  try {
    const importId = Number(req.params.importId);
    if (!Number.isInteger(importId) || importId < 1) {
      return res.status(400).json({ message: 'Valid import id is required' });
    }
    const result = await deleteImportedAttendanceByImportId(importId);
    if (!result.deleted) {
      return res.status(404).json({ message: 'Import not found' });
    }
    await logAudit(req.user.id, 'ATTENDANCE_IMPORT_DELETED', 'importhistory', {
      importId,
      attendanceRowsRemoved: result.attendanceRowsRemoved,
    });
    return res.json({
      message: 'Imported attendance removed',
      attendanceRowsRemoved: result.attendanceRowsRemoved,
    });
  } catch (err) {
    console.error('DELETE /admin/import-attendance/:importId:', err.message);
    return res.status(500).json({ message: err.message || 'Internal server error' });
  }
});

router.delete('/import-attendance', requirePermission(PERMISSION_MODULES.IMPORT_DATA), async (req, res) => {
  try {
    const confirm = String(req.body?.confirm || req.query?.confirm || '').toLowerCase();
    if (!['1', 'true', 'yes'].includes(confirm)) {
      return res.status(400).json({ message: 'Send confirm=true to delete all imported attendance' });
    }
    const result = await deleteAllImportedAttendance();
    await logAudit(req.user.id, 'ATTENDANCE_IMPORTS_CLEARED', 'importhistory', result);
    return res.json({
      message: 'All imported attendance removed',
      ...result,
    });
  } catch (err) {
    console.error('DELETE /admin/import-attendance:', err.message);
    return res.status(500).json({ message: err.message || 'Internal server error' });
  }
});

module.exports = router;
