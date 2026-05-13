const express = require('express');
const { db } = require('../db');
const { authMiddleware, enforcePasswordChange, requireRoles } = require('../middleware/auth');
const { getEffectiveAttendanceStatus } = require('../utils/attendanceView');

const router = express.Router();
router.use(authMiddleware);
router.use(enforcePasswordChange);
router.use(requireRoles('manager'));

router.get('/employees', (req, res) => {
  const employees = db.prepare(`
    SELECT e.id, e.employeecode, e.name, e.email, e.department
    FROM manageremployees me
    JOIN employees e ON e.id = me.employeeid
    WHERE me.managerid = ?
    ORDER BY e.name ASC
  `).all(req.user.id);
  return res.json({ employees });
});

router.get('/attendance/daily', (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ message: 'date query parameter is required (YYYY-MM-DD)' });
  }

  const records = db.prepare(`
    SELECT e.id as employeeid, e.employeecode, e.name, e.department, a.date, a.punchin, a.punchout, a.totalhours, COALESCE(a.status, 'absent') as status
    FROM manageremployees me
    JOIN employees e ON e.id = me.employeeid
    LEFT JOIN attendancelogs a ON a.employeeid = e.id AND a.date = ?
    WHERE me.managerid = ?
    ORDER BY e.name ASC
  `).all(date, req.user.id);

  const mapped = records.map((row) => {
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

  return res.json({ date, records: mapped });
});

router.get('/team-summary', (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) {
    return res.status(400).json({ message: 'month and year are required' });
  }

  const monthString = String(month).padStart(2, '0');
  const startDate = `${year}-${monthString}-01`;
  const endDate = `${year}-${monthString}-31`;

  const rows = db.prepare(`
    SELECT e.id as employeeid, e.employeecode, e.name,
      SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS presentdays,
      SUM(CASE WHEN a.status = 'halfday' THEN 1 ELSE 0 END) AS halfdays,
      SUM(CASE WHEN a.status = 'leave' THEN 1 ELSE 0 END) AS leavedays,
      SUM(CASE WHEN a.status = 'absent' OR a.status IS NULL THEN 1 ELSE 0 END) AS absentdays
    FROM manageremployees me
    JOIN employees e ON e.id = me.employeeid
    LEFT JOIN attendancelogs a ON a.employeeid = e.id AND a.date BETWEEN ? AND ?
    WHERE me.managerid = ?
    GROUP BY e.id, e.employeecode, e.name
    ORDER BY e.name ASC
  `).all(startDate, endDate, req.user.id);

  return res.json({ rows });
});

router.get('/dashboard-summary', (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const team = db.prepare(`
    SELECT e.id as employeeid, a.totalhours, a.status
    FROM manageremployees me
    JOIN employees e ON e.id = me.employeeid
    LEFT JOIN attendancelogs a ON a.employeeid = e.id AND a.date = ?
    WHERE me.managerid = ?
  `).all(date, req.user.id);

  const teamCountRow = { count: team.length };
  const pendingLeaveRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM leaves l
    JOIN manageremployees me ON me.employeeid = l.employeeid
    WHERE me.managerid = ? AND l.status = 'pending'
  `).get(req.user.id);

  let present = 0;
  let halfday = 0;
  let leave = 0;
  let absent = 0;

  for (const row of team) {
    const leaveExists = db.prepare(`
      SELECT 1 FROM leaves
      WHERE employeeid = ? AND status = 'approved' AND ? BETWEEN fromdate AND todate
      LIMIT 1
    `).get(row.employeeid, date);
    const status = getEffectiveAttendanceStatus({
      totalhours: row.totalhours,
      status: row.status,
      hasApprovedLeave: Boolean(leaveExists)
    });
    if (status === 'present') present += 1;
    else if (status === 'halfday') halfday += 1;
    else if (status === 'leave') leave += 1;
    else absent += 1;
  }

  return res.json({
    date,
    totalemployees: teamCountRow?.count || 0,
    pendingleaves: pendingLeaveRow?.count || 0,
    todaysummary: { present, halfday, leave, absent }
  });
});

module.exports = router;
