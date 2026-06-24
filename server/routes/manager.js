const express = require('express');
const { pool } = require('../db');
const { authMiddleware, enforcePasswordChange, requireRoles } = require('../middleware/auth');
const { getEffectiveAttendanceStatus } = require('../utils/attendanceView');
const { isHolidayDate } = require('../utils/holidaysRange');
const { approvedLeaveEmployeeIdsForDate } = require('../utils/attendanceLeaveLookup');
const { PRESENT_MIN_HOURS, HALFDAY_MIN_HOURS } = require('../utils/attendance');

const router = express.Router();
router.use(authMiddleware);
router.use(enforcePasswordChange);
router.use(requireRoles('manager'));

router.get('/employees', async (req, res) => {
  try {
    const { rows: employees } = await pool.query(
      `
      SELECT e.id, e.employeecode, e.name, e.email, e.department
      FROM manageremployees me
      JOIN employees e ON e.id = me.employeeid
      WHERE me.managerid = $1
      ORDER BY e.name ASC
    `,
      [req.user.id]
    );
    return res.json({ employees });
  } catch (err) {
    console.error('GET /manager/employees:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/attendance/daily', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ message: 'date query parameter is required (YYYY-MM-DD)' });
    }

    const recordsResult = await pool.query(
      `
      SELECT e.id AS employeeid, e.employeecode, e.name, e.department, a.date, a.punchin, a.punchout, a.totalhours, COALESCE(a.status, 'absent') AS status
      FROM manageremployees me
      JOIN employees e ON e.id = me.employeeid
      LEFT JOIN attendancelogs a ON a.employeeid = e.id AND a.date = $1::date
      WHERE me.managerid = $2
      ORDER BY e.name ASC
    `,
      [date, req.user.id]
    );

    const holiday = await isHolidayDate(date);
    const onLeaveIds = await approvedLeaveEmployeeIdsForDate(
      recordsResult.rows.map((r) => r.employeeid),
      date
    );
    const mapped = recordsResult.rows.map((row) => ({
      ...row,
      status: holiday
        ? 'holiday'
        : getEffectiveAttendanceStatus({
            totalhours: row.totalhours,
            status: row.status,
            hasApprovedLeave: onLeaveIds.has(row.employeeid),
          }),
    }));

    return res.json({ date, records: mapped });
  } catch (err) {
    console.error('GET /manager/attendance/daily:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/team-summary', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: 'month and year are required' });
    }

    const monthNum = Number(month);
    const yearNum = Number(year);
    const monthString = String(monthNum).padStart(2, '0');
    const startDate = `${yearNum}-${monthString}-01`;
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    const endDate = `${yearNum}-${monthString}-${String(lastDay).padStart(2, '0')}`;

    const { rows } = await pool.query(
      `
      SELECT e.id AS employeeid, e.employeecode, e.name,
        SUM(CASE WHEN a.totalhours IS NOT NULL AND a.totalhours >= ${PRESENT_MIN_HOURS} THEN 1 ELSE 0 END) AS presentdays,
        SUM(CASE WHEN a.totalhours IS NOT NULL AND a.totalhours > ${HALFDAY_MIN_HOURS} AND a.totalhours < ${PRESENT_MIN_HOURS} THEN 1 ELSE 0 END) AS halfdays,
        SUM(CASE WHEN a.status = 'leave' THEN 1 ELSE 0 END) AS leavedays,
        SUM(CASE WHEN a.id IS NULL OR (a.totalhours IS NOT NULL AND a.totalhours <= ${HALFDAY_MIN_HOURS}) OR (a.totalhours IS NULL AND COALESCE(a.status, 'absent') = 'absent') THEN 1 ELSE 0 END) AS absentdays
      FROM manageremployees me
      JOIN employees e ON e.id = me.employeeid
      LEFT JOIN attendancelogs a ON a.employeeid = e.id AND a.date BETWEEN $1::date AND $2::date
      WHERE me.managerid = $3
      GROUP BY e.id, e.employeecode, e.name
      ORDER BY e.name ASC
    `,
      [startDate, endDate, req.user.id]
    );

    return res.json({ rows });
  } catch (err) {
    console.error('GET /manager/team-summary:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/dashboard-summary', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const teamResult = await pool.query(
      `
      SELECT e.id AS employeeid, a.totalhours, a.status
      FROM manageremployees me
      JOIN employees e ON e.id = me.employeeid
      LEFT JOIN attendancelogs a ON a.employeeid = e.id AND a.date = $1::date
      WHERE me.managerid = $2
    `,
      [date, req.user.id]
    );
    const team = teamResult.rows;

    const pendingLeaveResult = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM leaves l
      JOIN manageremployees me ON me.employeeid = l.employeeid
      WHERE me.managerid = $1 AND l.status = 'pending'
    `,
      [req.user.id]
    );

    let present = 0;
    let halfday = 0;
    let leave = 0;
    let absent = 0;
    let holidays = 0;
    const holiday = await isHolidayDate(date);
    const onLeaveIds = await approvedLeaveEmployeeIdsForDate(
      team.map((r) => r.employeeid),
      date
    );

    for (const row of team) {
      if (holiday) {
        holidays += 1;
        continue;
      }
      const status = getEffectiveAttendanceStatus({
        totalhours: row.totalhours,
        status: row.status,
        hasApprovedLeave: onLeaveIds.has(row.employeeid),
      });
      if (status === 'present') present += 1;
      else if (status === 'halfday') halfday += 1;
      else if (status === 'leave') leave += 1;
      else absent += 1;
    }

    return res.json({
      date,
      totalemployees: team.length,
      pendingleaves: pendingLeaveResult.rows[0]?.count || 0,
      todaysummary: { present, halfday, leave, absent, holidays },
    });
  } catch (err) {
    console.error('GET /manager/dashboard-summary:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
