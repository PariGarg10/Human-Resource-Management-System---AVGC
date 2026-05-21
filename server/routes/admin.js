const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { format } = require('date-fns');
const { pool } = require('../db');
const { authMiddleware, requireAdminOrFounder, enforcePasswordChange } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { calculateTotalHours, getAttendanceStatus } = require('../utils/attendance');
const { generateEmployeeCode } = require('../utils/employeeCode');
const { getEffectiveAttendanceStatus } = require('../utils/attendanceView');
const { filterUpcomingBirthdays } = require('../utils/birthdays');
const { getHolidayDatesSet, isHolidayDate } = require('../utils/holidaysRange');
const { createNotification } = require('../utils/notifications');
const {
  parseAttendanceRow,
  normalizePersonName,
  normalizeImportDate,
  readAttendanceRowsFromFile,
} = require('../utils/attendanceImport');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

const {
  parseEmployeeImportFile,
  normalizeImportedRole,
  isJunkRow,
  validateEmployeeRows,
} = require('../utils/employeeImport');

router.use(authMiddleware);
router.use(enforcePasswordChange);
router.use(requireAdminOrFounder);

const ROLE_OPTIONS = new Set(['employee', 'manager', 'admin', 'it_head']);

router.post('/employees', async (req, res) => {
  try {
    const { name, email, password, department, role } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'name and email are required' });
    }

    const normalizedRole = ROLE_OPTIONS.has(String(role || '').toLowerCase().trim())
      ? String(role).toLowerCase().trim()
      : 'employee';
    if (normalizedRole !== 'employee' && !password) {
      return res.status(400).json({ message: 'Password is required for manager, admin, and IT Head roles' });
    }

    const generatedCode = await generateEmployeeCode();
    const isEmployee = normalizedRole === 'employee';
    const isRegistered = !isEmployee;
    const passwordhash = bcrypt.hashSync(password || `Temp@${Date.now()}_${generatedCode}`, 10);

    const result = await pool.query(
      `
      INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
      [generatedCode, name, email, passwordhash, department || null, normalizedRole, isRegistered, false]
    );

    await logAudit(req.user.id, 'EMPLOYEE_CREATED', 'employees', { employeecode: generatedCode, role: normalizedRole });

    return res.status(201).json({
      id: result.rows[0].id,
      name,
      email,
      department: department || null,
      role: normalizedRole,
      isregistered: isRegistered,
      employeecode: generatedCode,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Employee with same code or email already exists' });
    }
    console.error('POST /admin/employees:', error.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/employees', async (_req, res) => {
  try {
    const { rows: employees } = await pool.query(
      'SELECT id, employeecode, name, email, department, role, isregistered, createdat FROM employees ORDER BY id ASC'
    );
    return res.json({ employees });
  } catch (err) {
    console.error('GET /admin/employees:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/employees/:id/role', async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    const role = String(req.body.role || '').toLowerCase().trim();
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return res.status(400).json({ message: 'Valid employee id is required' });
    }
    if (!ROLE_OPTIONS.has(role)) {
      return res.status(400).json({ message: 'Role must be employee, manager, admin, or it_head' });
    }

    const targetResult = await pool.query('SELECT id, name, role FROM employees WHERE id = $1', [employeeId]);
    const target = targetResult.rows[0];
    if (!target) return res.status(404).json({ message: 'Employee not found' });

    await pool.query('UPDATE employees SET role = $1 WHERE id = $2', [role, employeeId]);
    await logAudit(req.user.id, 'EMPLOYEE_ROLE_UPDATED', 'employees', {
      employeeId,
      previousRole: target.role,
      role,
    });
    return res.json({ message: 'Role updated', employee: { ...target, role } });
  } catch (err) {
    console.error('PATCH /admin/employees/:id/role:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/upcoming-birthdays', async (_req, res) => {
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

router.get('/attendance/daily', async (req, res) => {
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

router.post('/managers', async (req, res) => {
  try {
    const { name, email, password, department } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, and password are required' });
    }
    const generatedCode = await generateEmployeeCode();
    const passwordhash = bcrypt.hashSync(password, 10);
    const result = await pool.query(
      `
      INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
      VALUES ($1, $2, $3, $4, $5, 'manager', TRUE, FALSE)
      RETURNING id
    `,
      [generatedCode, name, email, passwordhash, department || null]
    );

    await logAudit(req.user.id, 'MANAGER_CREATED', 'employees', { employeecode: generatedCode });
    return res.status(201).json({
      id: result.rows[0].id,
      employeecode: generatedCode,
      name,
      email,
      role: 'manager',
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Manager with same code or email already exists' });
    }
    console.error('POST /admin/managers:', error.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/managers/:id', async (req, res) => {
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

router.post('/manager-assignments', async (req, res) => {
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

router.post('/manager-assignments/bulk', async (req, res) => {
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

router.get('/manager-assignments', async (req, res) => {
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

router.delete('/manager-assignments/:employeeid', async (req, res) => {
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

router.get('/leaves', async (req, res) => {
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

router.put('/leaves/:id/approve', async (req, res) => {
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

router.put('/leaves/:id/reject', async (req, res) => {
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

router.post('/import-attendance', upload.single('file'), async (req, res) => {
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
            employeeResult.rows[0].id,
            date,
            punchIn && !Number.isNaN(punchIn.getTime()) ? punchIn.toISOString() : null,
            punchOut && !Number.isNaN(punchOut.getTime()) ? punchOut.toISOString() : null,
            Number.isNaN(totalHours) ? null : totalHours,
            status,
          ]
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

router.post('/import-employees', upload.single('file'), async (req, res) => {
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
          [employeecode, name, email, pwd, department, role, role === 'employee' ? false : true]
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

router.post('/import-employees/preview', upload.single('file'), async (req, res) => {
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

router.get('/import-history', async (_req, res) => {
  try {
    const { rows: history } = await pool.query('SELECT * FROM importhistory ORDER BY createdat DESC');
    return res.json({ history });
  } catch (err) {
    console.error('GET /admin/import-history:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
