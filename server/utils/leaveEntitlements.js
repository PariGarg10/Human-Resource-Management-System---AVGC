const {
  format,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
} = require('date-fns');
const { pool } = require('../db');

const PERIODS = new Set(['monthly', 'quarterly', 'yearly']);

const DEFAULT_ENTITLEMENTS = [
  { leave_type: 'Casual Leave', allotted_days: 12, period: 'yearly' },
  { leave_type: 'Sick Leave', allotted_days: 12, period: 'yearly' },
  { leave_type: 'Earned Leave', allotted_days: 15, period: 'yearly' },
  { leave_type: 'Work From Home', allotted_days: 24, period: 'yearly' },
];

let schemaReady = false;

async function ensureLeaveEntitlementsSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leave_entitlements (
      id SERIAL PRIMARY KEY,
      leave_type TEXT NOT NULL,
      allotted_days NUMERIC(8,2) NOT NULL CHECK (allotted_days >= 0),
      period TEXT NOT NULL CHECK (period IN ('monthly', 'quarterly', 'yearly')),
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_entitlements_org
    ON leave_entitlements (lower(trim(leave_type)), period)
    WHERE employee_id IS NULL AND is_active = TRUE
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_entitlements_employee
    ON leave_entitlements (employee_id, lower(trim(leave_type)), period)
    WHERE employee_id IS NOT NULL AND is_active = TRUE
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_leave_entitlements_employee_active ON leave_entitlements (employee_id, is_active)'
  );

  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM leave_entitlements WHERE employee_id IS NULL'
  );
  if ((rows[0]?.count || 0) === 0) {
    for (const row of DEFAULT_ENTITLEMENTS) {
      await pool.query(
        `
        INSERT INTO leave_entitlements (leave_type, allotted_days, period, employee_id, is_active)
        VALUES ($1, $2, $3, NULL, TRUE)
      `,
        [row.leave_type, row.allotted_days, row.period]
      );
    }
  }
  schemaReady = true;
}

function normalizePeriod(period) {
  const value = String(period || '').toLowerCase().trim();
  if (!PERIODS.has(value)) throw new Error('period must be monthly, quarterly, or yearly');
  return value;
}

function normalizeLeaveType(type) {
  return String(type || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPeriodBounds(period, refDate = new Date()) {
  const periodKey = normalizePeriod(period);
  if (periodKey === 'monthly') {
    return {
      period: periodKey,
      periodLabel: 'Monthly',
      from: format(startOfMonth(refDate), 'yyyy-MM-dd'),
      to: format(endOfMonth(refDate), 'yyyy-MM-dd'),
    };
  }
  if (periodKey === 'quarterly') {
    return {
      period: periodKey,
      periodLabel: 'Quarterly',
      from: format(startOfQuarter(refDate), 'yyyy-MM-dd'),
      to: format(endOfQuarter(refDate), 'yyyy-MM-dd'),
    };
  }
  return {
    period: periodKey,
    periodLabel: 'Yearly',
    from: format(startOfYear(refDate), 'yyyy-MM-dd'),
    to: format(endOfYear(refDate), 'yyyy-MM-dd'),
  };
}

function rowToEntitlement(row) {
  if (!row) return null;
  const bounds = getPeriodBounds(row.period);
  return {
    id: row.id,
    leaveType: row.leave_type,
    allottedDays: Number(row.allotted_days),
    period: row.period,
    periodLabel: bounds.periodLabel,
    employeeId: row.employee_id,
    employeeName: row.employee_name || null,
    employeeCode: row.employee_code || null,
    scope: row.employee_id ? 'employee' : 'organization',
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at,
  };
}

async function listEntitlements({ employeeId = null, includeInactive = false } = {}) {
  await ensureLeaveEntitlementsSchema();
  const clauses = [];
  const params = [];
  if (!includeInactive) clauses.push('e.is_active = TRUE');
  if (employeeId != null) {
    params.push(Number(employeeId));
    clauses.push(`(e.employee_id IS NULL OR e.employee_id = $${params.length})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `
      SELECT e.*, emp.name AS employee_name, emp.employeecode AS employee_code
      FROM leave_entitlements e
      LEFT JOIN employees emp ON emp.id = e.employee_id
      ${where}
      ORDER BY e.employee_id NULLS FIRST, e.leave_type ASC, e.period ASC
    `,
    params
  );
  return rows.map(rowToEntitlement);
}

async function getEffectiveEntitlementsForEmployee(employeeId) {
  await ensureLeaveEntitlementsSchema();
  const { rows } = await pool.query(
    `
      SELECT e.*, emp.name AS employee_name, emp.employeecode AS employee_code
      FROM leave_entitlements e
      LEFT JOIN employees emp ON emp.id = e.employee_id
      WHERE e.is_active = TRUE
        AND (e.employee_id IS NULL OR e.employee_id = $1)
      ORDER BY e.employee_id NULLS FIRST, e.leave_type ASC
    `,
    [employeeId]
  );

  const merged = new Map();
  for (const row of rows) {
    const key = `${String(row.leave_type).toLowerCase().trim()}|${row.period}`;
    const existing = merged.get(key);
    if (!existing || row.employee_id) {
      merged.set(key, row);
    }
  }
  return [...merged.values()];
}

async function createEntitlement(payload, createdBy) {
  await ensureLeaveEntitlementsSchema();
  const leaveType = normalizeLeaveType(payload.leaveType);
  const period = normalizePeriod(payload.period);
  const allottedDays = Number(payload.allottedDays);
  const employeeId =
    payload.employeeId != null && payload.employeeId !== '' ? Number(payload.employeeId) : null;

  if (!leaveType) throw new Error('Leave type is required');
  if (!Number.isFinite(allottedDays) || allottedDays < 0) {
    throw new Error('Allotted days must be zero or greater');
  }
  if (employeeId != null && (!Number.isInteger(employeeId) || employeeId <= 0)) {
    throw new Error('Invalid employee id');
  }

  const { rows } = await pool.query(
    `
      INSERT INTO leave_entitlements (leave_type, allotted_days, period, employee_id, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [leaveType, allottedDays, period, employeeId, createdBy || null]
  );
  return rowToEntitlement(rows[0]);
}

async function updateEntitlement(id, payload) {
  await ensureLeaveEntitlementsSchema();
  const existing = await pool.query('SELECT * FROM leave_entitlements WHERE id = $1', [id]);
  if (!existing.rows[0]) throw new Error('Leave entitlement not found');

  const leaveType =
    payload.leaveType !== undefined ? normalizeLeaveType(payload.leaveType) : existing.rows[0].leave_type;
  const period = payload.period !== undefined ? normalizePeriod(payload.period) : existing.rows[0].period;
  const allottedDays =
    payload.allottedDays !== undefined ? Number(payload.allottedDays) : Number(existing.rows[0].allotted_days);
  const employeeId =
    payload.employeeId !== undefined
      ? payload.employeeId != null && payload.employeeId !== ''
        ? Number(payload.employeeId)
        : null
      : existing.rows[0].employee_id;
  const isActive =
    payload.isActive !== undefined ? Boolean(payload.isActive) : Boolean(existing.rows[0].is_active);

  if (!leaveType) throw new Error('Leave type is required');
  if (!Number.isFinite(allottedDays) || allottedDays < 0) {
    throw new Error('Allotted days must be zero or greater');
  }

  const { rows } = await pool.query(
    `
      UPDATE leave_entitlements
      SET leave_type = $1,
          allotted_days = $2,
          period = $3,
          employee_id = $4,
          is_active = $5,
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `,
    [leaveType, allottedDays, period, employeeId, isActive, id]
  );
  return rowToEntitlement(rows[0]);
}

async function deleteEntitlement(id) {
  await ensureLeaveEntitlementsSchema();
  const result = await pool.query('DELETE FROM leave_entitlements WHERE id = $1 RETURNING id', [id]);
  if (!result.rows[0]) throw new Error('Leave entitlement not found');
}

module.exports = {
  PERIODS,
  ensureLeaveEntitlementsSchema,
  getPeriodBounds,
  listEntitlements,
  getEffectiveEntitlementsForEmployee,
  createEntitlement,
  updateEntitlement,
  deleteEntitlement,
  normalizeLeaveType,
};
