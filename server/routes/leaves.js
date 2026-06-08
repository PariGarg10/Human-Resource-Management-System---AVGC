const express = require('express');
const { pool } = require('../db');
const { authMiddleware, enforcePasswordChange, requireRoles } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { getHolidayDatesSet } = require('../utils/holidaysRange');
const { createNotification } = require('../utils/notifications');
const { TEAM_LEAD_SQL } = require('../utils/teamLeads');
const { isEmployeeRole } = require('../constants/roles');

const router = express.Router();
router.use(authMiddleware);
router.use(enforcePasswordChange);

const ALLOWED_TYPES = new Set(['Sick Leave', 'Casual Leave', 'Paid Leave', 'Work From Home']);
const EMPLOYEE_SELF_SERVICE_ROLES = ['employee', 'manager', 'admin'];

async function activeAdminsExcept(userId) {
  const { rows } = await pool.query(
    `
      SELECT id FROM employees
      WHERE role = 'admin'
        AND id != $1
        AND COALESCE(isregistered, TRUE) = TRUE
    `,
    [userId]
  );
  return rows;
}

async function cancellationRecipients(leave) {
  const managersResult = await pool.query(
    `
      SELECT e.id
      FROM manageremployees me
      JOIN employees e ON e.id = me.managerid
      WHERE me.employeeid = $1
        AND COALESCE(e.isregistered, TRUE) = TRUE
    `,
    [leave.employeeid]
  );

  if (managersResult.rows.length > 0) {
    return managersResult.rows;
  }

  const employeeResult = await pool.query('SELECT role FROM employees WHERE id = $1', [leave.employeeid]);
  const employee = employeeResult.rows[0];
  if (employee?.role === 'manager' || employee?.role === 'admin') {
    return activeAdminsExcept(leave.employeeid);
  }

  return [];
}

async function assertTeamLeadEmployee(teamLeadId) {
  const id = Number(teamLeadId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const { rows } = await pool.query(
    `
      SELECT id, name, employeecode, designation
      FROM employees
      WHERE id = $1
        AND COALESCE(isregistered, TRUE) = TRUE
        AND ${TEAM_LEAD_SQL.replace(/\n/g, ' ')}
      LIMIT 1
    `,
    [id]
  );
  return rows[0] || null;
}

async function notifyLeaveApplied(leave, employee, reportingToId) {
  const employeeName = employee?.name || 'An employee';
  const message = `${employeeName} applied for ${leave.leavetype} from ${leave.fromdate} to ${leave.todate}.`;
  const notified = new Set();

  if (reportingToId) {
    const teamLead = await assertTeamLeadEmployee(reportingToId);
    if (teamLead) {
      await createNotification(teamLead.id, 'leave_applied', message, {
        subjectEmployeeId: employee.id,
        eventDate: leave.fromdate,
      });
      notified.add(teamLead.id);
    }
  }

  const managersResult = await pool.query(
    `
      SELECT e.id
      FROM manageremployees me
      JOIN employees e ON e.id = me.managerid
      WHERE me.employeeid = $1
        AND COALESCE(e.isregistered, TRUE) = TRUE
    `,
    [employee.id]
  );

  for (const row of managersResult.rows) {
    if (notified.has(row.id)) continue;
    await createNotification(row.id, 'leave_applied', message, {
      subjectEmployeeId: employee.id,
      eventDate: leave.fromdate,
    });
    notified.add(row.id);
  }
}

async function notifyLeaveCancelled(leave) {
  const employeeResult = await pool.query('SELECT name FROM employees WHERE id = $1', [leave.employeeid]);
  const employee = employeeResult.rows[0];
  const employeeName = employee?.name || 'An employee';
  const message = `${employeeName} cancelled ${leave.leavetype} from ${leave.fromdate} to ${leave.todate}.`;
  const recipients = await cancellationRecipients(leave);

  for (const recipient of recipients) {
    await pool.query(
      `INSERT INTO notifications (userid, message, type, isread, subjectemployeeid, eventdate) VALUES ($1, $2, 'leave_cancelled', FALSE, $3, $4)`,
      [recipient.id, message, leave.employeeid, leave.fromdate]
    );
  }
}

async function removeGeneratedLeaveAttendance(leave) {
  const from = new Date(leave.fromdate);
  const to = new Date(leave.todate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return;

  for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    await pool.query(
      `
      DELETE FROM attendancelogs
      WHERE employeeid = $1
        AND date = $2::date
        AND status = 'leave'
        AND COALESCE(totalhours, 0) = 0
        AND punchin IS NULL
        AND punchout IS NULL
    `,
      [leave.employeeid, date]
    );
  }
}

async function ensureManagedPendingLeave(managerId, leaveId) {
  const { rows } = await pool.query(
    `
      SELECT l.*
      FROM leaves l
      JOIN manageremployees me ON me.employeeid = l.employeeid
      WHERE l.id = $1 AND me.managerid = $2
      LIMIT 1
    `,
    [leaveId, managerId]
  );
  const leave = rows[0];
  if (!leave) {
    const exists = await pool.query('SELECT id FROM leaves WHERE id = $1', [leaveId]);
    const err = new Error(exists.rows[0] ? 'You can only process leave requests for your assigned team' : 'Leave not found');
    err.status = exists.rows[0] ? 403 : 404;
    throw err;
  }
  if (String(leave.status || '').toLowerCase() !== 'pending') {
    const err = new Error('Leave already processed');
    err.status = 400;
    throw err;
  }
  return leave;
}

async function applyApprovedLeaveAttendance(leave) {
  const holidayDates = await getHolidayDatesSet(leave.fromdate, leave.todate);
  const from = new Date(leave.fromdate);
  const to = new Date(leave.todate);
  for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
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
}

router.post('/apply', requireRoles(...EMPLOYEE_SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const { leavetype, fromdate, todate, reason, reportingToId, reporting_to_id } = req.body;
    if (!leavetype || !fromdate || !todate) {
      return res.status(400).json({ message: 'leavetype, fromdate, and todate are required' });
    }
    if (!ALLOWED_TYPES.has(leavetype)) {
      return res.status(400).json({ message: 'Invalid leave type' });
    }

    const reportingRaw = reportingToId ?? reporting_to_id;
    const { rows: teamLeadRows } = await pool.query(
      `
        SELECT id FROM employees
        WHERE COALESCE(isregistered, TRUE) = TRUE
          AND ${TEAM_LEAD_SQL.replace(/\n/g, ' ')}
      `
    );
    const teamLeadsExist = teamLeadRows.length > 0;
    let reportingId = reportingRaw != null && reportingRaw !== '' ? Number(reportingRaw) : null;

    if (teamLeadsExist && isEmployeeRole(req.user.role)) {
      if (!Number.isFinite(reportingId) || reportingId <= 0) {
        return res.status(400).json({ message: 'Please select who you are currently reporting to' });
      }
      const teamLead = await assertTeamLeadEmployee(reportingId);
      if (!teamLead) {
        return res.status(400).json({ message: 'Selected team lead is not valid' });
      }
    } else {
      reportingId = null;
    }

    const employeeResult = await pool.query(
      'SELECT id, name, email, employeecode, department, designation, reporting_to_id FROM employees WHERE id = $1',
      [req.user.id]
    );
    const employee = employeeResult.rows[0];
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    if (reportingId) {
      await pool.query('UPDATE employees SET reporting_to_id = $1 WHERE id = $2', [reportingId, req.user.id]);
      employee.reporting_to_id = reportingId;
    }

    const result = await pool.query(
      `
      INSERT INTO leaves (employeeid, leavetype, fromdate, todate, reason, status, reporting_to_id)
      VALUES ($1, $2, $3::date, $4::date, $5, 'pending', $6)
      RETURNING id, employeeid, leavetype, fromdate, todate, reason, status, reporting_to_id
    `,
      [req.user.id, leavetype, fromdate, todate, reason || null, reportingId]
    );

    const leave = result.rows[0];
    const leaveId = leave.id;
    await notifyLeaveApplied(leave, employee, reportingId);
    await logAudit(req.user.id, 'LEAVE_APPLIED', 'leaves', { leaveId, reportingToId: reportingId });
    return res.status(201).json({ message: 'Leave request submitted', id: leaveId });
  } catch (err) {
    console.error('POST /leaves/apply:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/my-leaves', requireRoles(...EMPLOYEE_SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const { rows: leaves } = await pool.query(
      'SELECT * FROM leaves WHERE employeeid = $1 ORDER BY createdat DESC',
      [req.user.id]
    );
    return res.json({ leaves });
  } catch (err) {
    console.error('GET /leaves/my-leaves:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/:leaveId/cancel', requireRoles(...EMPLOYEE_SELF_SERVICE_ROLES), async (req, res) => {
  const leaveId = Number(req.params.leaveId);
  if (!Number.isFinite(leaveId)) {
    return res.status(400).json({ message: 'Invalid leave id' });
  }

  try {
    const leaveResult = await pool.query('SELECT * FROM leaves WHERE id = $1', [leaveId]);
    const leave = leaveResult.rows[0];
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    if (leave.employeeid !== req.user.id) {
      return res.status(403).json({ message: 'You can only cancel your own leave requests' });
    }
    if (!['pending', 'approved'].includes(String(leave.status).toLowerCase())) {
      return res.status(400).json({ message: 'Only pending or approved leaves can be cancelled' });
    }

    await pool.query("UPDATE leaves SET status = 'cancelled' WHERE id = $1", [leaveId]);
    if (String(leave.status).toLowerCase() === 'approved') {
      await removeGeneratedLeaveAttendance(leave);
    }
    await notifyLeaveCancelled(leave);
    await logAudit(req.user.id, 'LEAVE_CANCELLED', 'leaves', { leaveId });

    return res.json({ message: 'Leave cancelled' });
  } catch (err) {
    console.error('PATCH /leaves/:leaveId/cancel:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/team', requireRoles('manager'), async (req, res) => {
  try {
    const { rows: leaves } = await pool.query(
      `
      SELECT l.*, e.employeecode, e.name, e.department
      FROM leaves l
      JOIN employees e ON e.id = l.employeeid
      JOIN manageremployees me ON me.employeeid = e.id
      WHERE me.managerid = $1
      ORDER BY l.createdat DESC
    `,
      [req.user.id]
    );
    return res.json({ leaves });
  } catch (err) {
    console.error('GET /leaves/team:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/team/:leaveId/approve', requireRoles('manager'), async (req, res) => {
  const leaveId = Number(req.params.leaveId);
  if (!Number.isFinite(leaveId)) return res.status(400).json({ message: 'Invalid leave id' });

  try {
    const leave = await ensureManagedPendingLeave(req.user.id, leaveId);
    await pool.query("UPDATE leaves SET status = 'approved', approvedby = $1 WHERE id = $2", [req.user.id, leaveId]);
    await applyApprovedLeaveAttendance(leave);
    await logAudit(req.user.id, 'TEAM_LEAVE_APPROVED', 'leaves', { leaveId });
    await createNotification(
      leave.employeeid,
      'leave_approved',
      `Your ${leave.leavetype} from ${leave.fromdate} to ${leave.todate} was approved by your manager.`,
      { subjectEmployeeId: req.user.id, eventDate: leave.fromdate }
    );
    return res.json({ message: 'Leave approved' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('PUT /leaves/team/:leaveId/approve:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/team/:leaveId/reject', requireRoles('manager'), async (req, res) => {
  const leaveId = Number(req.params.leaveId);
  if (!Number.isFinite(leaveId)) return res.status(400).json({ message: 'Invalid leave id' });

  try {
    const leave = await ensureManagedPendingLeave(req.user.id, leaveId);
    await pool.query("UPDATE leaves SET status = 'rejected', approvedby = $1 WHERE id = $2", [req.user.id, leaveId]);
    await logAudit(req.user.id, 'TEAM_LEAVE_REJECTED', 'leaves', { leaveId });
    await createNotification(
      leave.employeeid,
      'leave_rejected',
      `Your ${leave.leavetype} from ${leave.fromdate} to ${leave.todate} was rejected by your manager.`,
      { subjectEmployeeId: req.user.id, eventDate: leave.fromdate }
    );
    return res.json({ message: 'Leave rejected' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('PUT /leaves/team/:leaveId/reject:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
