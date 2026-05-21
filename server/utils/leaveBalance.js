const { format, eachDayOfInterval, getDay } = require('date-fns');
const { pool } = require('../db');
const { getHolidayDatesSet } = require('./holidaysRange');
const { getSaturdayConfigMerged } = require('./saturdayConfigRange');

const LEAVE_POLICIES = [
  { type: 'Casual Leave', total: 12 },
  { type: 'Sick Leave', total: 12 },
  { type: 'Earned Leave', total: 15, aliases: ['Paid Leave'] },
  { type: 'Work From Home', total: 24 },
];

function dateFromYmd(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function normalizeType(type) {
  const policy = LEAVE_POLICIES.find((p) => p.type === type || (p.aliases || []).includes(type));
  return policy ? policy.type : type;
}

async function countChargeableLeaveDays(fromdate, todate, year) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const startStr = fromdate > yearStart ? fromdate : yearStart;
  const endStr = todate < yearEnd ? todate : yearEnd;
  if (startStr > endStr) return 0;

  const holidayDates = await getHolidayDatesSet(startStr, endStr);
  const offSaturdays = new Set(
    (await getSaturdayConfigMerged(startStr, endStr))
      .filter((entry) => entry.status !== 'working')
      .map((entry) => entry.date)
  );

  let count = 0;
  for (const day of eachDayOfInterval({ start: dateFromYmd(startStr), end: dateFromYmd(endStr) })) {
    const key = format(day, 'yyyy-MM-dd');
    const jsDay = getDay(day);
    if (jsDay === 0 || holidayDates.has(key) || offSaturdays.has(key)) continue;
    count += 1;
  }
  return count;
}

async function getLeaveBalance(employeeId, year = new Date().getFullYear()) {
  const { rows } = await pool.query(
    `
      SELECT leavetype, fromdate::text AS fromdate, todate::text AS todate
      FROM leaves
      WHERE employeeid = $1
        AND status = 'approved'
        AND todate >= $2::date
        AND fromdate <= $3::date
    `,
    [employeeId, `${year}-01-01`, `${year}-12-31`]
  );

  const usedByType = new Map(LEAVE_POLICIES.map((policy) => [policy.type, 0]));
  for (const row of rows) {
    const type = normalizeType(row.leavetype);
    if (!usedByType.has(type)) continue;
    usedByType.set(
      type,
      usedByType.get(type) + (await countChargeableLeaveDays(row.fromdate, row.todate, year))
    );
  }

  const attendanceResult = await pool.query(
    `
      SELECT date::text AS date, totalhours
      FROM attendancelogs
      WHERE employeeid = $1
        AND date >= $2::date
        AND date <= $3::date
        AND totalhours IS NOT NULL
        AND status != 'leave'
    `,
    [employeeId, `${year}-01-01`, `${year}-12-31`]
  );

  let attendanceDeduction = 0;
  for (const row of attendanceResult.rows) {
    if (row.totalhours > 4 && row.totalhours < 8.5) attendanceDeduction += 0.5;
    else if (row.totalhours < 4) attendanceDeduction += 1;
  }
  usedByType.set('Casual Leave', (usedByType.get('Casual Leave') || 0) + attendanceDeduction);

  const balances = LEAVE_POLICIES.map((policy) => {
    const used = usedByType.get(policy.type) || 0;
    return {
      type: policy.type,
      total: policy.total,
      used,
      remaining: Math.max(0, policy.total - used),
    };
  });

  const totals = balances.reduce(
    (acc, item) => ({
      total: acc.total + item.total,
      used: acc.used + item.used,
      remaining: acc.remaining + item.remaining,
    }),
    { total: 0, used: 0, remaining: 0 }
  );

  return { employeeId, year, balances, totals };
}

module.exports = { LEAVE_POLICIES, getLeaveBalance };
