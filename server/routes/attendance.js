const express = require('express');
const { format, eachDayOfInterval, getDaysInMonth } = require('date-fns');
const { pool } = require('../db');
const { authMiddleware, enforcePasswordChange } = require('../middleware/auth');
const { getEffectiveAttendanceStatus } = require('../utils/attendanceView');
const { calculateTotalHours, getAttendanceStatus } = require('../utils/attendance');
const { getSaturdayConfigMerged } = require('../utils/saturdayConfigRange');
const { getHolidaysForRange, getHolidayDatesSet, isHolidayDate } = require('../utils/holidaysRange');

const router = express.Router();
router.use(authMiddleware);
router.use(enforcePasswordChange);

router.get('/today', async (req, res) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');

    const recordResult = await pool.query(
      'SELECT * FROM attendancelogs WHERE employeeid = $1 AND date = $2::date',
      [req.user.id, today]
    );
    const record = recordResult.rows[0];

    let leave = null;
    if (!(await isHolidayDate(today))) {
      const leaveResult = await pool.query(
        `
        SELECT 1
        FROM leaves
        WHERE employeeid = $1 AND status = 'approved' AND $2::date BETWEEN fromdate AND todate
        LIMIT 1
      `,
        [req.user.id, today]
      );
      leave = leaveResult.rows[0];
    }

    const effectiveRecord = record
      ? {
          ...record,
          status: getEffectiveAttendanceStatus({
            totalhours: record.totalhours,
            status: record.status,
            hasApprovedLeave: Boolean(leave),
          }),
        }
      : leave
        ? { date: today, totalhours: 0, punchin: null, punchout: null, status: 'leave' }
        : null;

    if (await isHolidayDate(today)) {
      const holidays = await getHolidaysForRange(today, today);
      const hol = holidays[0];
      const base = effectiveRecord || { date: today, totalhours: 0, punchin: null, punchout: null, status: 'absent' };
      return res.json({
        date: today,
        record: {
          ...base,
          status: 'holiday',
          holidayName: hol?.holidayName || 'Holiday',
          holidayType: hol?.type || 'national',
        },
      });
    }

    return res.json({
      date: today,
      record: effectiveRecord,
    });
  } catch (err) {
    console.error('GET /attendance/today:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);

    if (!month || !year || month < 1 || month > 12) {
      return res.status(400).json({ message: 'Valid month and year are required' });
    }

    const monthString = String(month).padStart(2, '0');
    const startDate = `${year}-${monthString}-01`;
    const endDate = `${year}-${monthString}-${String(getDaysInMonth(new Date(year, month - 1))).padStart(2, '0')}`;

    const recordsResult = await pool.query(
      `
      SELECT date::text AS date, punchin, punchout, totalhours, status
      FROM attendancelogs
      WHERE employeeid = $1 AND date BETWEEN $2::date AND $3::date
      ORDER BY date ASC
    `,
      [req.user.id, startDate, endDate]
    );
    const leaveRowsResult = await pool.query(
      `
      SELECT fromdate::text AS fromdate, todate::text AS todate
      FROM leaves
      WHERE employeeid = $1 AND status = 'approved' AND todate >= $2::date AND fromdate <= $3::date
    `,
      [req.user.id, startDate, endDate]
    );

    const holidayDates = await getHolidayDatesSet(startDate, endDate);

    const leavesByDate = new Set();
    for (const row of leaveRowsResult.rows) {
      const start = new Date(row.fromdate);
      const end = new Date(row.todate);
      for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
        const d = format(day, 'yyyy-MM-dd');
        if (d >= startDate && d <= endDate && !holidayDates.has(d)) leavesByDate.add(d);
      }
    }

    const merged = new Map(recordsResult.rows.map((r) => [r.date, { ...r }]));
    for (const d of leavesByDate) {
      const existing = merged.get(d);
      if (!existing) {
        merged.set(d, { date: d, punchin: null, punchout: null, totalhours: 0, status: 'leave' });
      } else {
        existing.status = getEffectiveAttendanceStatus({
          totalhours: existing.totalhours,
          status: existing.status,
          hasApprovedLeave: true,
        });
      }
    }

    const mergedRecords = Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));

    const saturdayConfig = await getSaturdayConfigMerged(startDate, endDate);
    const holidays = await getHolidaysForRange(startDate, endDate);

    return res.json({ records: mergedRecords, saturdayConfig, holidays });
  } catch (err) {
    console.error('GET /attendance/history:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/summary', async (req, res) => {
  try {
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

    const recordsResult = await pool.query(
      'SELECT date::text AS date, status FROM attendancelogs WHERE employeeid = $1 AND date BETWEEN $2::date AND $3::date',
      [req.user.id, startDate, endDate]
    );
    const leaveRowsResult = await pool.query(
      `
      SELECT fromdate::text AS fromdate, todate::text AS todate
      FROM leaves
      WHERE employeeid = $1 AND status = 'approved' AND todate >= $2::date AND fromdate <= $3::date
    `,
      [req.user.id, startDate, endDate]
    );

    const holidayDates = await getHolidayDatesSet(startDate, endDate);

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

    return res.json({ present, halfday, leave, absent, holidays: holidaysCount, totaldays: days.length });
  } catch (err) {
    console.error('GET /attendance/summary:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** Authenticated GPS / self-service punch (same rules as biometric punch). */
router.post('/punch', async (req, res) => {
  try {
    const type = req.body && req.body.type;
    if (!['in', 'out'].includes(type)) {
      return res.status(400).json({ message: 'type must be "in" or "out"' });
    }

    const punchTime = new Date();
    const date = format(punchTime, 'yyyy-MM-dd');

    let attendanceResult = await pool.query(
      'SELECT * FROM attendancelogs WHERE employeeid = $1 AND date = $2::date',
      [req.user.id, date]
    );
    let attendance = attendanceResult.rows[0];

    if (!attendance) {
      await pool.query('INSERT INTO attendancelogs (employeeid, date, status) VALUES ($1, $2::date, $3)', [
        req.user.id,
        date,
        'absent',
      ]);
      attendanceResult = await pool.query(
        'SELECT * FROM attendancelogs WHERE employeeid = $1 AND date = $2::date',
        [req.user.id, date]
      );
      attendance = attendanceResult.rows[0];
    }

    if (type === 'in') {
      if (!attendance.punchin) {
        await pool.query('UPDATE attendancelogs SET punchin = $1 WHERE id = $2', [
          punchTime.toISOString(),
          attendance.id,
        ]);
        return res.json({ message: 'Punch-in recorded', ignored: false, date });
      }
      return res.json({ message: 'Punch-in already recorded', ignored: true, date });
    }

    if (!attendance.punchin) {
      return res.status(400).json({ message: 'Punch-out requires punch-in first' });
    }

    const totalHours = calculateTotalHours(attendance.punchin, punchTime.toISOString());
    const status = getAttendanceStatus(totalHours);

    await pool.query('UPDATE attendancelogs SET punchout = $1, totalhours = $2, status = $3 WHERE id = $4', [
      punchTime.toISOString(),
      totalHours,
      status,
      attendance.id,
    ]);

    return res.json({ message: 'Punch-out recorded', totalhours: totalHours, status, date });
  } catch (err) {
    console.error('POST /attendance/punch:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
