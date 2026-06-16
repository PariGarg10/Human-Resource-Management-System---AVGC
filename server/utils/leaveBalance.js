const { format, eachDayOfInterval, getDay } = require('date-fns');
const { pool } = require('../db');
const { getHolidayDatesSet } = require('./holidaysRange');
const { getSaturdayConfigMerged } = require('./saturdayConfigRange');
const {
  ensureLeaveEntitlementsSchema,
  getEffectiveEntitlementsForEmployee,
  getPeriodBounds,
} = require('./leaveEntitlements');
const { PRESENT_MIN_HOURS, HALFDAY_MIN_HOURS } = require('./attendance');

const LEGACY_LEAVE_POLICIES = [
  { type: 'Casual Leave', total: 12, aliases: ['Paid Leave'] },
  { type: 'Sick Leave', total: 12 },
  { type: 'Earned Leave', total: 15, aliases: ['Paid Leave'] },
  { type: 'Work From Home', total: 24 },
];

function dateFromYmd(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function normalizeType(type, entitlements) {
  const raw = String(type || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  const match = entitlements.find((e) => e.leave_type.toLowerCase() === lower);
  if (match) return match.leave_type;
  for (const legacy of LEGACY_LEAVE_POLICIES) {
    if (legacy.type.toLowerCase() === lower || (legacy.aliases || []).some((a) => a.toLowerCase() === lower)) {
      const legacyMatch = entitlements.find((e) => e.leave_type.toLowerCase() === legacy.type.toLowerCase());
      return legacyMatch ? legacyMatch.leave_type : legacy.type;
    }
  }
  return raw;
}

async function countChargeableLeaveDays(fromdate, todate, rangeFrom, rangeTo) {
  const startStr = fromdate > rangeFrom ? fromdate : rangeFrom;
  const endStr = todate < rangeTo ? todate : rangeTo;
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
  await ensureLeaveEntitlementsSchema();
  const now = new Date();
  const refDate = year === now.getFullYear() ? now : new Date(year, 6, 1);
  const entitlements = await getEffectiveEntitlementsForEmployee(employeeId);

  const entitlementKeys = entitlements.map((e) => ({
    row: e,
    bounds: getPeriodBounds(e.period, refDate),
    type: e.leave_type,
  }));

  let minFrom = `${year}-01-01`;
  let maxTo = `${year}-12-31`;
  if (entitlementKeys.length) {
    minFrom = entitlementKeys.reduce((min, e) => (e.bounds.from < min ? e.bounds.from : min), entitlementKeys[0].bounds.from);
    maxTo = entitlementKeys.reduce((max, e) => (e.bounds.to > max ? e.bounds.to : max), entitlementKeys[0].bounds.to);
  }

  const { rows } = await pool.query(
    `
      SELECT leavetype, fromdate::text AS fromdate, todate::text AS todate
      FROM leaves
      WHERE employeeid = $1
        AND status = 'approved'
        AND todate >= $2::date
        AND fromdate <= $3::date
    `,
    [employeeId, minFrom, maxTo]
  );

  const usedByKey = new Map(entitlementKeys.map((e) => [`${e.type}|${e.bounds.period}`, 0]));

  for (const row of rows) {
    for (const ent of entitlementKeys) {
      const type = normalizeType(row.leavetype, entitlements);
      if (type.toLowerCase() !== ent.type.toLowerCase()) continue;
      const key = `${ent.type}|${ent.bounds.period}`;
      usedByKey.set(
        key,
        (usedByKey.get(key) || 0) +
          (await countChargeableLeaveDays(row.fromdate, row.todate, ent.bounds.from, ent.bounds.to))
      );
    }
  }

  const casualEnt = entitlementKeys.find((e) => e.type.toLowerCase() === 'casual leave');
  if (casualEnt) {
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
      [employeeId, casualEnt.bounds.from, casualEnt.bounds.to]
    );

    let attendanceDeduction = 0;
    for (const row of attendanceResult.rows) {
      if (row.totalhours > HALFDAY_MIN_HOURS && row.totalhours < PRESENT_MIN_HOURS) attendanceDeduction += 0.5;
      else if (row.totalhours <= HALFDAY_MIN_HOURS) attendanceDeduction += 1;
    }
    const key = `${casualEnt.type}|${casualEnt.bounds.period}`;
    usedByKey.set(key, (usedByKey.get(key) || 0) + attendanceDeduction);
  }

  const balances = entitlementKeys.map((ent) => {
    const total = Number(ent.row.allotted_days);
    const key = `${ent.type}|${ent.bounds.period}`;
    const used = usedByKey.get(key) || 0;
    return {
      type: ent.type,
      total,
      used,
      remaining: Math.max(0, total - used),
      period: ent.bounds.period,
      periodLabel: ent.bounds.periodLabel,
      periodFrom: ent.bounds.from,
      periodTo: ent.bounds.to,
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

module.exports = { getLeaveBalance, LEGACY_LEAVE_POLICIES };
