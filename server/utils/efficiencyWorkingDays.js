const { format, eachDayOfInterval } = require('date-fns');
const { pool } = require('../db');

/**
 * WORKING DAYS (WDs) — sourced from attendance + approved leave exclusion.
 *   Table:   attendancelogs (employeeid, date, status IN present/halfday)
 *   Exclude: approved leave date ranges from leaves table
 */
const WD_INTEGRATION_PROPOSAL = {
  table: 'attendancelogs',
  employeeColumn: 'employeeid',
  dateColumn: 'date',
  presentStatuses: ['present', 'halfday'],
  leaveTable: 'leaves',
  leaveStatus: 'approved',
};

function isWdIntegrationConfirmed() {
  return String(process.env.EFFICIENCY_WD_INTEGRATION || 'confirmed').toLowerCase() !== 'disabled';
}

function dateFromYmd(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d);
}

async function loadApprovedLeaveDates(employeeId, fromDate, toDate) {
  const { rows } = await pool.query(
    `
      SELECT fromdate::text AS fromdate, todate::text AS todate
      FROM leaves
      WHERE employeeid = $1
        AND status = 'approved'
        AND todate >= $2::date
        AND fromdate <= $3::date
    `,
    [employeeId, fromDate, toDate]
  );
  const dates = new Set();
  for (const row of rows) {
    for (const day of eachDayOfInterval({
      start: dateFromYmd(row.fromdate),
      end: dateFromYmd(row.todate),
    })) {
      dates.add(format(day, 'yyyy-MM-dd'));
    }
  }
  return dates;
}

/**
 * Count actual working days from attendance punches.
 */
async function countEmployeeWorkingDays(employeeId, fromDate, toDate) {
  if (!isWdIntegrationConfirmed()) {
    return {
      wd: null,
      wdIntegrationStatus: 'disabled',
      wdIntegrationProposal: WD_INTEGRATION_PROPOSAL,
    };
  }

  const leaveDates = await loadApprovedLeaveDates(employeeId, fromDate, toDate);
  const { rows } = await pool.query(
    `
      SELECT date::text AS date, status
      FROM attendancelogs
      WHERE employeeid = $1
        AND date >= $2::date
        AND date <= $3::date
        AND lower(trim(COALESCE(status, ''))) IN ('present', 'halfday')
    `,
    [employeeId, fromDate, toDate]
  );

  let wd = 0;
  for (const row of rows) {
    if (leaveDates.has(row.date)) continue;
    wd += 1;
  }

  return {
    wd,
    wdIntegrationStatus: 'confirmed',
    wdIntegrationProposal: WD_INTEGRATION_PROPOSAL,
  };
}

/** Attendance punch hours for a single calendar day (totalhours from attendancelogs). */
async function getAttendanceHoursForDate(employeeId, dateStr) {
  if (!isWdIntegrationConfirmed()) return null;
  const { rows } = await pool.query(
    `
      SELECT totalhours
      FROM attendancelogs
      WHERE employeeid = $1 AND date = $2::date
      LIMIT 1
    `,
    [employeeId, dateStr]
  );
  const hours = Number(rows[0]?.totalhours);
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

async function loadWdOverride(employeeId, fromDate, toDate) {
  const { rows } = await pool.query(
    `
      SELECT wd
      FROM efficiency_wd_overrides
      WHERE employee_id = $1
        AND period_from = $2::date
        AND period_to = $3::date
      LIMIT 1
    `,
    [employeeId, fromDate, toDate]
  );
  if (!rows[0]) return null;
  const wd = Number(rows[0].wd);
  return Number.isFinite(wd) ? wd : null;
}

async function resolveEmployeeWorkingDays(employeeId, fromDate, toDate) {
  const batch = await resolveWorkingDaysBatch([employeeId], fromDate, toDate);
  return (
    batch.get(Number(employeeId)) || {
      wd: null,
      wdSource: 'attendance',
      wdIntegrationStatus: isWdIntegrationConfirmed() ? 'confirmed' : 'disabled',
      wdIntegrationProposal: WD_INTEGRATION_PROPOSAL,
    }
  );
}

/**
 * Resolve WDs for many employees in a small number of DB round-trips (not N+1).
 */
async function resolveWorkingDaysBatch(employeeIds, fromDate, toDate) {
  const ids = [...new Set(employeeIds.map(Number).filter(Number.isFinite))];
  const result = new Map();
  if (!ids.length) return result;

  const disabledPayload = {
    wd: null,
    wdIntegrationStatus: 'disabled',
    wdIntegrationProposal: WD_INTEGRATION_PROPOSAL,
    wdSource: 'attendance',
  };

  if (!isWdIntegrationConfirmed()) {
    for (const id of ids) result.set(id, { ...disabledPayload });
    return result;
  }

  const { rows: overrideRows } = await pool.query(
    `
      SELECT employee_id, wd
      FROM efficiency_wd_overrides
      WHERE employee_id = ANY($1::int[])
        AND period_from = $2::date
        AND period_to = $3::date
    `,
    [ids, fromDate, toDate]
  );
  const overrideByEmployee = new Map(
    overrideRows.map((r) => [Number(r.employee_id), Number(r.wd)])
  );

  const needAttendance = ids.filter((id) => !overrideByEmployee.has(id));
  const leaveDatesByEmployee = new Map();
  const attendanceByEmployee = new Map();

  if (needAttendance.length) {
    const { rows: leaveRows } = await pool.query(
      `
        SELECT employeeid, fromdate::text AS fromdate, todate::text AS todate
        FROM leaves
        WHERE employeeid = ANY($1::int[])
          AND status = 'approved'
          AND todate >= $2::date
          AND fromdate <= $3::date
      `,
      [needAttendance, fromDate, toDate]
    );
    for (const id of needAttendance) leaveDatesByEmployee.set(id, new Set());
    for (const row of leaveRows) {
      const empId = Number(row.employeeid);
      const set = leaveDatesByEmployee.get(empId);
      if (!set) continue;
      for (const day of eachDayOfInterval({
        start: dateFromYmd(row.fromdate),
        end: dateFromYmd(row.todate),
      })) {
        set.add(format(day, 'yyyy-MM-dd'));
      }
    }

    const { rows: attRows } = await pool.query(
      `
        SELECT employeeid, date::text AS date
        FROM attendancelogs
        WHERE employeeid = ANY($1::int[])
          AND date >= $2::date
          AND date <= $3::date
          AND lower(trim(COALESCE(status, ''))) IN ('present', 'halfday')
      `,
      [needAttendance, fromDate, toDate]
    );
    for (const id of needAttendance) attendanceByEmployee.set(id, []);
    for (const row of attRows) {
      const empId = Number(row.employeeid);
      const list = attendanceByEmployee.get(empId);
      if (list) list.push(row.date);
    }
  }

  for (const id of ids) {
    const overrideWd = overrideByEmployee.get(id);
    if (overrideWd != null && Number.isFinite(overrideWd)) {
      result.set(id, {
        wd: overrideWd,
        wdSource: 'override',
        wdIntegrationStatus: 'confirmed',
        wdIntegrationProposal: WD_INTEGRATION_PROPOSAL,
      });
      continue;
    }
    const leaveDates = leaveDatesByEmployee.get(id) || new Set();
    let wd = 0;
    for (const date of attendanceByEmployee.get(id) || []) {
      if (!leaveDates.has(date)) wd += 1;
    }
    result.set(id, {
      wd,
      wdSource: 'attendance',
      wdIntegrationStatus: 'confirmed',
      wdIntegrationProposal: WD_INTEGRATION_PROPOSAL,
    });
  }

  return result;
}

/** Batch-fetch attendance hours for employee+date pairs used in output capping. */
async function getAttendanceHoursMap(rows) {
  const map = new Map();
  if (!isWdIntegrationConfirmed() || !rows.length) return map;

  const employeeIds = [...new Set(rows.map((r) => Number(r.employee_id)).filter(Number.isFinite))];
  const dates = [...new Set(rows.map((r) => String(r.log_date)).filter(Boolean))];
  if (!employeeIds.length || !dates.length) return map;

  const { rows: attRows } = await pool.query(
    `
      SELECT employeeid, date::text AS date, totalhours
      FROM attendancelogs
      WHERE employeeid = ANY($1::int[])
        AND date = ANY($2::date[])
    `,
    [employeeIds, dates]
  );

  for (const row of attRows) {
    const hours = Number(row.totalhours);
    if (Number.isFinite(hours) && hours >= 0) {
      map.set(`${row.employeeid}:${row.date}`, hours);
    }
  }
  return map;
}

module.exports = {
  WD_INTEGRATION_PROPOSAL,
  isWdIntegrationConfirmed,
  countEmployeeWorkingDays,
  getAttendanceHoursForDate,
  getAttendanceHoursMap,
  loadWdOverride,
  resolveEmployeeWorkingDays,
  resolveWorkingDaysBatch,
};
