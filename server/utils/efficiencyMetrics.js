const { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } = require('date-fns');
const { pool } = require('../db');
const {
  resolveWorkingDaysBatch,
  getAttendanceHoursMap,
  isWdIntegrationConfirmed,
  WD_INTEGRATION_PROPOSAL,
} = require('./efficiencyWorkingDays');

function parseYmd(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function resolvePeriodRange(period, dateStr) {
  const anchor = parseYmd(dateStr) || format(new Date(), 'yyyy-MM-dd');
  const anchorDate = new Date(`${anchor}T12:00:00`);
  const p = String(period || 'day').toLowerCase();

  if (p === 'week') {
    const from = format(startOfWeek(anchorDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const to = format(endOfWeek(anchorDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    return { period: 'week', from, to, label: `${from} – ${to}` };
  }
  if (p === 'month') {
    const from = format(startOfMonth(anchorDate), 'yyyy-MM-dd');
    const to = format(endOfMonth(anchorDate), 'yyyy-MM-dd');
    return { period: 'month', from, to, label: format(anchorDate, 'yyyy-MM') };
  }
  return { period: 'day', from: anchor, to: anchor, label: anchor };
}

function computeRating(efficiencyPercent) {
  if (efficiencyPercent == null || Number.isNaN(efficiencyPercent)) return null;
  return Math.min((efficiencyPercent / 100) * 3, 5);
}

function computeEfficiencyFromTotals(totalMhs, wd) {
  if (wd == null || wd <= 0) {
    return { totalMDs: null, efficiencyPercent: null, rating: null };
  }
  const totalMDs = totalMhs / 8;
  const efficiencyPercent = (totalMDs / wd) * 100;
  return {
    totalMDs: Number(totalMDs.toFixed(4)),
    efficiencyPercent: Number(efficiencyPercent.toFixed(2)),
    rating: Number(computeRating(efficiencyPercent).toFixed(2)),
  };
}

/**
 * Output hours (implied MHs) must be <= attendance hours - 1; otherwise cap at 8.
 */
function capDailyOutputHours(totalOutputHours, attendanceHours) {
  const output = Number(totalOutputHours) || 0;
  if (attendanceHours == null || !Number.isFinite(Number(attendanceHours))) return output;
  const attendance = Number(attendanceHours);
  const maxAllowed = attendance - 1;
  if (output <= maxAllowed) return Number(output.toFixed(4));
  return 8;
}

function scaleRowsToCappedTotal(rows, cappedTotal) {
  const rawTotal = rows.reduce((sum, r) => sum + (Number(r.implied_mhs) || 0), 0);
  if (rawTotal <= 0) return rows.map((r) => ({ ...r, cappedImpliedMhs: 0 }));
  if (Math.abs(rawTotal - cappedTotal) < 0.0001) {
    return rows.map((r) => ({ ...r, cappedImpliedMhs: Number(r.implied_mhs) || 0 }));
  }
  const factor = cappedTotal / rawTotal;
  return rows.map((r) => ({
    ...r,
    cappedImpliedMhs: Number(((Number(r.implied_mhs) || 0) * factor).toFixed(4)),
  }));
}

async function aggregateApprovedLogs({ employeeId, projectId, from, to, employeeIds }) {
  const params = [from, to];
  let idx = 3;
  let employeeFilter = '';
  let projectFilter = '';

  if (employeeId) {
    employeeFilter = ` AND wl.employee_id = $${idx}`;
    params.push(Number(employeeId));
    idx += 1;
  } else if (Array.isArray(employeeIds) && employeeIds.length) {
    employeeFilter = ` AND wl.employee_id = ANY($${idx}::int[])`;
    params.push(employeeIds);
    idx += 1;
  }
  if (projectId) {
    projectFilter = ` AND wl.project_id = $${idx}`;
    params.push(Number(projectId));
    idx += 1;
  }

  const { rows } = await pool.query(
    `
      SELECT
        wl.id AS work_log_id,
        wl.employee_id,
        wl.employee_name,
        wl.project_id,
        ep.name AS project_name,
        tb.task_name,
        tb.version_label,
        tb.unit_label,
        wl.log_date::text AS log_date,
        wl.actual_output_qty,
        wl.implied_mhs,
        wl.remarks,
        wl.actual_manhours_spent
      FROM work_logs wl
      JOIN task_baselines tb ON tb.id = wl.task_baseline_id
      JOIN efficiency_projects ep ON ep.id = wl.project_id
      WHERE wl.status = 'approved'
        AND wl.log_date >= $1::date
        AND wl.log_date <= $2::date
        ${employeeFilter}
        ${projectFilter}
      ORDER BY wl.log_date ASC, wl.employee_name ASC, ep.name ASC
    `,
    params
  );
  return rows;
}

async function applyDailyOutputCaps(rows) {
  const byEmployeeDay = new Map();
  for (const row of rows) {
    const key = `${row.employee_id}:${row.log_date}`;
    if (!byEmployeeDay.has(key)) byEmployeeDay.set(key, []);
    byEmployeeDay.get(key).push(row);
  }

  const attendanceHoursMap = await getAttendanceHoursMap(rows);
  const cappedByKey = new Map();

  for (const [key, dayRows] of byEmployeeDay.entries()) {
    const rawTotal = dayRows.reduce((s, r) => s + (Number(r.implied_mhs) || 0), 0);
    const attendanceHours = attendanceHoursMap.get(key) ?? null;
    const cappedTotal = capDailyOutputHours(rawTotal, attendanceHours);
    const scaled = scaleRowsToCappedTotal(dayRows, cappedTotal);
    for (const row of scaled) {
      cappedByKey.set(`${row.work_log_id}`, {
        cappedImpliedMhs: row.cappedImpliedMhs,
        rawImpliedMhs: Number(row.implied_mhs) || 0,
        attendanceHours,
        outputCapped: Math.abs(cappedTotal - rawTotal) > 0.0001,
      });
    }
  }

  return rows.map((row) => {
    const cap = cappedByKey.get(String(row.work_log_id)) || {
      cappedImpliedMhs: Number(row.implied_mhs) || 0,
      rawImpliedMhs: Number(row.implied_mhs) || 0,
      attendanceHours: null,
      outputCapped: false,
    };
    return { ...row, ...cap };
  });
}

async function buildEfficiencyReport(filters) {
  const range = resolvePeriodRange(filters.period, filters.date);
  const rawRows = await aggregateApprovedLogs({
    employeeId: filters.employeeId,
    projectId: filters.projectId,
    from: range.from,
    to: range.to,
    employeeIds: filters.employeeIds,
  });
  const rows = await applyDailyOutputCaps(rawRows);

  const byEmployee = new Map();
  for (const row of rows) {
    const key = row.employee_id;
    if (!byEmployee.has(key)) {
      byEmployee.set(key, {
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        totalMhs: 0,
        breakdown: [],
      });
    }
    const entry = byEmployee.get(key);
    const mhs = Number(row.cappedImpliedMhs) || 0;
    entry.totalMhs += mhs;
    entry.breakdown.push({
      projectId: row.project_id,
      projectName: row.project_name,
      taskName: row.task_name,
      versionLabel: row.version_label,
      logDate: row.log_date,
      actualOutputQty: Number(row.actual_output_qty),
      impliedMhs: mhs,
      rawImpliedMhs: row.rawImpliedMhs,
      outputCapped: row.outputCapped,
    });
  }

  const employeeIds = [...byEmployee.keys()];
  const wdByEmployee = await resolveWorkingDaysBatch(employeeIds, range.from, range.to);

  const employees = [];
  for (const entry of byEmployee.values()) {
    const wdResult = wdByEmployee.get(entry.employeeId) || {
      wd: null,
      wdSource: 'attendance',
      wdIntegrationStatus: isWdIntegrationConfirmed() ? 'confirmed' : 'disabled',
    };
    const totals = computeEfficiencyFromTotals(entry.totalMhs, wdResult.wd);
    employees.push({
      ...entry,
      totalMhs: Number(entry.totalMhs.toFixed(4)),
      ...totals,
      wd: wdResult.wd,
      wdSource: wdResult.wdSource,
      wdIntegrationStatus: wdResult.wdIntegrationStatus,
    });
  }

  return {
    period: range.period,
    from: range.from,
    to: range.to,
    periodLabel: range.label,
    wdIntegrationStatus: isWdIntegrationConfirmed() ? 'confirmed' : 'disabled',
    wdIntegrationProposal: WD_INTEGRATION_PROPOSAL,
    employees,
    rows: rows.map((row) => ({
      work_log_id: row.work_log_id,
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      project_id: row.project_id,
      project_name: row.project_name,
      task_name: row.task_name,
      version_label: row.version_label,
      log_date: row.log_date,
      actual_output_qty: row.actual_output_qty,
      implied_mhs: row.cappedImpliedMhs,
      raw_implied_mhs: row.rawImpliedMhs,
      attendance_hours: row.attendanceHours,
      output_capped: row.outputCapped,
    })),
  };
}

async function buildDailyInputsReport(filters) {
  const date = parseYmd(filters.date) || format(new Date(), 'yyyy-MM-dd');
  const rawRows = await aggregateApprovedLogs({
    employeeId: filters.employeeId,
    projectId: filters.projectId,
    from: date,
    to: date,
    employeeIds: filters.employeeIds,
  });
  const rows = await applyDailyOutputCaps(rawRows);

  const byEmployee = new Map();
  for (const row of rows) {
    if (!byEmployee.has(row.employee_id)) {
      byEmployee.set(row.employee_id, {
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        rows: [],
      });
    }
    byEmployee.get(row.employee_id).rows.push({
      workLogId: row.work_log_id,
      projectId: row.project_id,
      projectName: row.project_name,
      taskName: row.task_name,
      versionLabel: row.version_label,
      unitLabel: row.unit_label,
      logDate: row.log_date,
      actualOutputQty: Number(row.actual_output_qty),
      actualManhoursSpent:
        row.actual_manhours_spent != null ? Number(row.actual_manhours_spent) : null,
      remarks: row.remarks || null,
      outputHours: row.cappedImpliedMhs,
      rawOutputHours: row.rawImpliedMhs,
      attendanceHours: row.attendanceHours,
      outputCapped: row.outputCapped,
    });
  }

  const dailyEmployeeIds = [...byEmployee.keys()];
  const wdByEmployee = await resolveWorkingDaysBatch(dailyEmployeeIds, date, date);

  const employees = [];
  for (const entry of byEmployee.values()) {
    const wdResult = wdByEmployee.get(entry.employeeId) || { wd: null, wdSource: 'attendance' };
    const totalOutputHours = entry.rows.reduce((s, r) => s + r.outputHours, 0);
    employees.push({
      ...entry,
      workDays: wdResult.wd,
      workDaysSource: wdResult.wdSource,
      totalOutputHours: Number(totalOutputHours.toFixed(4)),
    });
  }

  employees.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  return { date, from: date, to: date, employees };
}

function computeManhoursPerUnit({ calcType, standardHours, standardOutputQty, manhoursPerUnit }) {
  const calc = String(calcType || '').toLowerCase();
  if (calc === 'weight_based') {
    const weight = Number(manhoursPerUnit ?? standardHours);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error('weight_based baselines require manhours_per_unit (difficulty weight) > 0');
    }
    return weight;
  }
  if (calc === 'rate_based') {
    const hours = Number(standardHours);
    const qty = Number(standardOutputQty);
    if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(qty) || qty <= 0) {
      throw new Error('rate_based baselines require standard_hours and standard_output_qty > 0');
    }
    return hours / qty;
  }
  throw new Error('calc_type must be rate_based or weight_based');
}

module.exports = {
  resolvePeriodRange,
  computeManhoursPerUnit,
  computeEfficiencyFromTotals,
  capDailyOutputHours,
  buildEfficiencyReport,
  buildDailyInputsReport,
};
