const express = require('express');
const { format, eachDayOfInterval } = require('date-fns');
const { pool } = require('../db');
const { authMiddleware, enforceForcePasswordChange } = require('../middleware/auth');
const { getLeaveBalance } = require('../utils/leaveBalance');
const { getHolidayDatesSet, isHolidayDate } = require('../utils/holidaysRange');
const { getEffectiveAttendanceStatus } = require('../utils/attendance');

const router = express.Router();
router.use(authMiddleware);
router.use(enforceForcePasswordChange);

async function fetchNotifications(userId) {
  const { rows } = await pool.query(
    `
      SELECT id, message, type, isread AS "isRead", createdat
      FROM notifications
      WHERE userid = $1
      ORDER BY createdat DESC
      LIMIT 100
    `,
    [userId]
  );
  const notifications = rows.map((r) => ({
    id: r.id,
    message: r.message,
    type: r.type,
    isRead: Boolean(r.isRead),
    createdAt: r.createdat,
  }));
  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.isRead).length,
  };
}

async function fetchEmployeeAttendanceSummary(userId, month, year) {
  const monthString = String(month).padStart(2, '0');
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const startDate = format(start, 'yyyy-MM-dd');
  const endDate = format(end, 'yyyy-MM-dd');

  const [recordsResult, leaveRowsResult, holidayDates] = await Promise.all([
    pool.query(
      'SELECT date::text AS date, status FROM attendancelogs WHERE employeeid = $1 AND date BETWEEN $2::date AND $3::date',
      [userId, startDate, endDate]
    ),
    pool.query(
      `
        SELECT fromdate::text AS fromdate, todate::text AS todate
        FROM leaves
        WHERE employeeid = $1 AND status = 'approved' AND todate >= $2::date AND fromdate <= $3::date
      `,
      [userId, startDate, endDate]
    ),
    getHolidayDatesSet(startDate, endDate),
  ]);

  const statusByDate = new Map(recordsResult.rows.map((r) => [r.date, r.status || 'absent']));
  for (const row of leaveRowsResult.rows) {
    const from = new Date(row.fromdate);
    const to = new Date(row.todate);
    for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
      const key = format(day, 'yyyy-MM-dd');
      if (key < startDate || key > endDate) continue;
      if (holidayDates.has(key)) continue;
      const current = statusByDate.get(key);
      if (current !== 'present' && current !== 'halfday') {
        statusByDate.set(key, 'leave');
      }
    }
  }

  let present = 0;
  let halfday = 0;
  let absent = 0;
  let leave = 0;
  let holidaysCount = 0;

  const days = eachDayOfInterval({ start, end });
  for (const day of days) {
    const key = format(day, 'yyyy-MM-dd');
    if (holidayDates.has(key)) {
      holidaysCount += 1;
      continue;
    }
    const status = statusByDate.get(key) || 'absent';
    if (status === 'present') present += 1;
    else if (status === 'halfday') halfday += 1;
    else if (status === 'leave') leave += 1;
    else absent += 1;
  }

  return { present, halfday, leave, absent, holidays: holidaysCount, totaldays: days.length };
}

async function fetchManagerDashboardSummary(managerId, date) {
  const [teamResult, pendingLeaveResult, holiday] = await Promise.all([
    pool.query(
      `
        SELECT e.id AS employeeid, a.totalhours, a.status
        FROM manageremployees me
        JOIN employees e ON e.id = me.employeeid
        LEFT JOIN attendancelogs a ON a.employeeid = e.id AND a.date = $1::date
        WHERE me.managerid = $2
      `,
      [date, managerId]
    ),
    pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM leaves l
        JOIN manageremployees me ON me.employeeid = l.employeeid
        WHERE me.managerid = $1 AND l.status = 'pending'
      `,
      [managerId]
    ),
    isHolidayDate(date),
  ]);

  const team = teamResult.rows;
  let present = 0;
  let halfday = 0;
  let leave = 0;
  let absent = 0;
  let holidays = 0;

  for (const row of team) {
    if (holiday) {
      holidays += 1;
      continue;
    }
    const leaveExistsResult = await pool.query(
      `
        SELECT 1 FROM leaves
        WHERE employeeid = $1 AND status = 'approved' AND $2::date BETWEEN fromdate AND todate
        LIMIT 1
      `,
      [row.employeeid, date]
    );
    const status = getEffectiveAttendanceStatus({
      totalhours: row.totalhours,
      status: row.status,
      hasApprovedLeave: leaveExistsResult.rows.length > 0,
    });
    if (status === 'present') present += 1;
    else if (status === 'halfday') halfday += 1;
    else if (status === 'leave') leave += 1;
    else absent += 1;
  }

  return {
    date,
    totalemployees: team.length,
    pendingleaves: pendingLeaveResult.rows[0]?.count || 0,
    todaysummary: { present, halfday, leave, absent, holidays },
  };
}


/** GET /api/dashboard/home — single round-trip for dashboard widgets */
router.get('/home', async (req, res) => {
  try {
    const userId = req.user.id;
    const role = String(req.user.role || '').toLowerCase().trim();
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const today = now.toISOString().slice(0, 10);

    const [leaveBalance, notificationData] = await Promise.all([
      getLeaveBalance(userId, year).catch(() => null),
      fetchNotifications(userId).catch(() => ({ notifications: [], unreadCount: 0 })),
    ]);

    let attendanceSummary = null;
    let managerSummary = null;

    if (role === 'manager') {
      managerSummary = await fetchManagerDashboardSummary(userId, today).catch(() => null);
    } else {
      attendanceSummary = await fetchEmployeeAttendanceSummary(userId, month, year).catch(() => null);
    }

    return res.json({
      leaveBalance,
      notifications: notificationData.notifications,
      unreadCount: notificationData.unreadCount,
      attendanceSummary,
      managerSummary,
    });
  } catch (err) {
    console.error('GET /dashboard/home:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
