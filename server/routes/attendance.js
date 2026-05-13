const express = require('express');
const { format, eachDayOfInterval, getDaysInMonth } = require('date-fns');
const { db } = require('../db');
const { authMiddleware, enforcePasswordChange } = require('../middleware/auth');
const { getEffectiveAttendanceStatus } = require('../utils/attendanceView');

const router = express.Router();
router.use(authMiddleware);
router.use(enforcePasswordChange);

router.get('/today', (req, res) => {
  const today = format(new Date(), 'yyyy-MM-dd');

  const record = db
    .prepare('SELECT * FROM attendancelogs WHERE employeeid = ? AND date = ?')
    .get(req.user.id, today);
  const leave = db
    .prepare(`
      SELECT 1
      FROM leaves
      WHERE employeeid = ? AND status = 'approved' AND ? BETWEEN fromdate AND todate
      LIMIT 1
    `)
    .get(req.user.id, today);

  const effectiveRecord = record
    ? { ...record, status: getEffectiveAttendanceStatus({ totalhours: record.totalhours, status: record.status, hasApprovedLeave: Boolean(leave) }) }
    : (leave ? { date: today, totalhours: 0, punchin: null, punchout: null, status: 'leave' } : null);

  return res.json({
    date: today,
    record: effectiveRecord
  });
});

router.get('/history', (req, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);

  if (!month || !year || month < 1 || month > 12) {
    return res.status(400).json({ message: 'Valid month and year are required' });
  }

  const monthString = String(month).padStart(2, '0');
  const startDate = `${year}-${monthString}-01`;
  const endDate = `${year}-${monthString}-${String(getDaysInMonth(new Date(year, month - 1))).padStart(2, '0')}`;

  const records = db
    .prepare(`
      SELECT date, punchin, punchout, totalhours, status
      FROM attendancelogs
      WHERE employeeid = ? AND date BETWEEN ? AND ?
      ORDER BY date ASC
    `)
    .all(req.user.id, startDate, endDate);
  const leaveRows = db
    .prepare(`
      SELECT fromdate, todate
      FROM leaves
      WHERE employeeid = ? AND status = 'approved' AND todate >= ? AND fromdate <= ?
    `)
    .all(req.user.id, startDate, endDate);

  const leavesByDate = new Set();
  for (const row of leaveRows) {
    const start = new Date(row.fromdate);
    const end = new Date(row.todate);
    for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      const d = format(day, 'yyyy-MM-dd');
      if (d >= startDate && d <= endDate) leavesByDate.add(d);
    }
  }

  const merged = new Map(records.map((r) => [r.date, { ...r }]));
  for (const d of leavesByDate) {
    const existing = merged.get(d);
    if (!existing) {
      merged.set(d, { date: d, punchin: null, punchout: null, totalhours: 0, status: 'leave' });
    } else {
      existing.status = getEffectiveAttendanceStatus({
        totalhours: existing.totalhours,
        status: existing.status,
        hasApprovedLeave: true
      });
    }
  }

  const mergedRecords = Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));

  return res.json({ records: mergedRecords });
});

router.get('/summary', (req, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);

  if (!month || !year || month < 1 || month > 12) {
    return res.status(400).json({ message: 'Valid month and year are required' });
  }

  const monthString = String(month).padStart(2, '0');
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const startDate = format(start, 'yyyy-MM-dd');
  const endDate = format(end, 'yyyy-MM-dd');

  const records = db
    .prepare('SELECT date, status FROM attendancelogs WHERE employeeid = ? AND date BETWEEN ? AND ?')
    .all(req.user.id, startDate, endDate);
  const leaveRows = db
    .prepare(`
      SELECT fromdate, todate
      FROM leaves
      WHERE employeeid = ? AND status = 'approved' AND todate >= ? AND fromdate <= ?
    `)
    .all(req.user.id, startDate, endDate);

  const statusByDate = new Map(records.map((r) => [r.date, r.status || 'absent']));
  for (const row of leaveRows) {
    const from = new Date(row.fromdate);
    const to = new Date(row.todate);
    for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
      const key = format(day, 'yyyy-MM-dd');
      if (key < startDate || key > endDate) continue;
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

  const days = eachDayOfInterval({ start, end });
  for (const day of days) {
    const key = format(day, 'yyyy-MM-dd');
    const status = statusByDate.get(key) || 'absent';
    if (status === 'present') present += 1;
    else if (status === 'halfday') halfday += 1;
    else if (status === 'leave') leave += 1;
    else absent += 1;
  }

  return res.json({ present, halfday, leave, absent, totaldays: days.length });
});

module.exports = router;
