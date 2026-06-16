const { format, eachDayOfInterval, getDay } = require('date-fns');
const { pool } = require('../db');
const { getLeaveBalance } = require('./leaveBalance');
const { getHolidayDatesSet } = require('./holidaysRange');
const { getSaturdayConfigMerged } = require('./saturdayConfigRange');
const { PRESENT_MIN_HOURS, HALFDAY_MIN_HOURS } = require('./attendance');

function dateFromYmd(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d);
}

async function countWorkingDays(fromStr, toStr) {
  if (!fromStr || !toStr || fromStr > toStr) return 0;
  const holidayDates = await getHolidayDatesSet(fromStr, toStr);
  const offSaturdays = new Set(
    (await getSaturdayConfigMerged(fromStr, toStr))
      .filter((entry) => entry.status !== 'working')
      .map((entry) => entry.date)
  );
  let count = 0;
  for (const day of eachDayOfInterval({ start: dateFromYmd(fromStr), end: dateFromYmd(toStr) })) {
    const key = format(day, 'yyyy-MM-dd');
    const jsDay = getDay(day);
    if (jsDay === 0 || holidayDates.has(key) || offSaturdays.has(key)) continue;
    count += 1;
  }
  return count;
}

async function getExitNoticeSummary(employeeId, exitRequest) {
  const noticeStart = exitRequest.reviewed_at
    ? format(new Date(exitRequest.reviewed_at), 'yyyy-MM-dd')
    : format(new Date(exitRequest.created_at), 'yyyy-MM-dd');
  const lwd =
    exitRequest.confirmed_last_working_day ||
    exitRequest.last_working_day ||
    exitRequest.requested_last_working_day;
  const today = format(new Date(), 'yyyy-MM-dd');
  const periodEnd = lwd && lwd < today ? lwd : today;

  const attendance = await pool.query(
    `
      SELECT date::text AS date, totalhours, status
      FROM attendancelogs
      WHERE employeeid = $1
        AND date >= $2::date
        AND date <= $3::date
      ORDER BY date ASC
    `,
    [employeeId, noticeStart, periodEnd]
  );

  let lopDays = 0;
  let presentDays = 0;
  let leaveDays = 0;
  const workingDaysInPeriod = await countWorkingDays(noticeStart, periodEnd);

  for (const row of attendance.rows) {
    if (row.status === 'leave' || row.status === 'on_leave') {
      leaveDays += 1;
      continue;
    }
    const hours = Number(row.totalhours);
    if (!Number.isFinite(hours)) continue;
    if (hours >= PRESENT_MIN_HOURS) {
      presentDays += 1;
    } else if (hours > HALFDAY_MIN_HOURS) {
      presentDays += 0.5;
      lopDays += 0.5;
    } else if (hours > 0) {
      lopDays += 1;
    }
  }

  const year = lwd ? Number(String(lwd).slice(0, 4)) : new Date().getFullYear();
  const leaveBalance = await getLeaveBalance(employeeId, year);

  const daysUntilLwd =
    lwd && lwd >= today
      ? await countWorkingDays(today, lwd)
      : 0;

  return {
    noticeStart,
    lastWorkingDay: lwd,
    periodEnd,
    workingDaysInNotice: workingDaysInPeriod,
    daysUntilLastWorkingDay: daysUntilLwd,
    attendance: {
      presentDays,
      leaveDays,
      lopDays,
      records: attendance.rows.length,
    },
    leaveBalance: leaveBalance.balances,
    leaveTotals: leaveBalance.totals,
  };
}

module.exports = { getExitNoticeSummary };
