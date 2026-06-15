const { pool } = require('../db');
const { createNotification } = require('./notifications');

const CLEARANCE_TYPES = ['manager', 'it', 'finance', 'admin'];

const ACTIVE_EXIT_STATUSES = [
  'pending',
  'pending_hr_review',
  'in_progress',
  'serving_notice',
  'clearances_pending',
  'letters_ready',
];

const EXIT_TYPES = ['resignation', 'voluntary', 'retirement', 'mutual_separation', 'termination', 'other'];

async function ensureExitWorkflowSchema() {
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_status VARCHAR(50) NOT NULL DEFAULT 'active'`
  );

  await pool.query(`ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS exit_type VARCHAR(50)`);
  await pool.query(`ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS requested_last_working_day DATE`);
  await pool.query(`ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS confirmed_last_working_day DATE`);
  await pool.query(`ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS employee_reason TEXT`);
  await pool.query(`ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS hr_notes TEXT`);
  await pool.query(`ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES employees(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS kt_signed_off BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS kt_signed_off_by INTEGER REFERENCES employees(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS kt_signed_off_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS relieving_letter_url TEXT`);
  await pool.query(`ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS experience_letter_url TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exit_interviews (
      id SERIAL PRIMARY KEY,
      exit_request_id INTEGER NOT NULL UNIQUE REFERENCES exit_requests(id) ON DELETE CASCADE,
      employee_self_assessment JSONB,
      hr_interview_notes TEXT,
      final_reason TEXT,
      employee_submitted_at TIMESTAMPTZ,
      hr_recorded_at TIMESTAMPTZ,
      hr_recorded_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kt_tasks (
      id SERIAL PRIMARY KEY,
      exit_request_id INTEGER NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      handover_owner_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      assigned_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_kt_tasks_exit ON kt_tasks (exit_request_id, status)`
  );

  const { rows: activeExits } = await pool.query(
    `SELECT id FROM exit_requests WHERE status NOT IN ('completed', 'rejected', 'cancelled')`
  );
  for (const er of activeExits) {
    for (const type of CLEARANCE_TYPES) {
      await pool.query(
        `
          INSERT INTO exit_clearances (exit_request_id, clearance_type, status)
          VALUES ($1, $2, 'pending')
          ON CONFLICT (exit_request_id, clearance_type) DO NOTHING
        `,
        [er.id, type]
      );
    }
  }
}

async function employeeManagers(employeeId) {
  const { rows } = await pool.query(
    `
      SELECT DISTINCT managerid AS id
      FROM manageremployees
      WHERE employeeid = $1
      UNION
      SELECT reporting_to_id AS id
      FROM employees
      WHERE id = $1 AND reporting_to_id IS NOT NULL
    `,
    [employeeId]
  );
  return rows.map((r) => r.id).filter(Boolean);
}

async function seedClearances(exitRequestId) {
  for (const type of CLEARANCE_TYPES) {
    await pool.query(
      `
        INSERT INTO exit_clearances (exit_request_id, clearance_type, status)
        VALUES ($1, $2, 'pending')
        ON CONFLICT (exit_request_id, clearance_type) DO NOTHING
      `,
      [exitRequestId, type]
    );
  }
}

async function getActiveExitForEmployee(employeeId) {
  const { rows } = await pool.query(
    `
      SELECT er.*,
        json_agg(
          json_build_object(
            'id', ec.id,
            'clearanceType', ec.clearance_type,
            'status', ec.status,
            'remarks', ec.remarks,
            'updatedAt', ec.updated_at
          ) ORDER BY ec.clearance_type
        ) FILTER (WHERE ec.id IS NOT NULL) AS clearances
      FROM exit_requests er
      LEFT JOIN exit_clearances ec ON ec.exit_request_id = er.id
      WHERE er.employee_id = $1 AND er.status = ANY($2::varchar[])
      GROUP BY er.id
      ORDER BY er.id DESC
      LIMIT 1
    `,
    [employeeId, ACTIVE_EXIT_STATUSES]
  );
  return rows[0] || null;
}

async function getExitInterview(exitRequestId) {
  const { rows } = await pool.query(`SELECT * FROM exit_interviews WHERE exit_request_id = $1`, [exitRequestId]);
  return rows[0] || null;
}

async function getKtTasks(exitRequestId) {
  const { rows } = await pool.query(
    `
      SELECT kt.*, e.name AS handover_owner_name
      FROM kt_tasks kt
      LEFT JOIN employees e ON e.id = kt.handover_owner_id
      WHERE kt.exit_request_id = $1
      ORDER BY kt.created_at ASC, kt.id ASC
    `,
    [exitRequestId]
  );
  return rows;
}

async function getManagerSubmission(exitRequestId) {
  const { rows } = await pool.query(
    `SELECT * FROM exit_manager_submissions WHERE exit_request_id = $1 LIMIT 1`,
    [exitRequestId]
  );
  return rows[0] || null;
}

function mapClearances(raw) {
  return Array.isArray(raw) ? raw.filter(Boolean) : [];
}

function mapExitRow(row) {
  if (!row) return null;
  const lwd = row.confirmed_last_working_day || row.last_working_day;
  return {
    id: row.id,
    employeeId: row.employee_id,
    status: row.status,
    exitType: row.exit_type,
    lastWorkingDay: lwd,
    requestedLastWorkingDay: row.requested_last_working_day,
    confirmedLastWorkingDay: row.confirmed_last_working_day || row.last_working_day,
    reason: row.reason || row.employee_reason,
    employeeReason: row.employee_reason || row.reason,
    hrNotes: row.hr_notes,
    reviewedAt: row.reviewed_at,
    ktSignedOff: row.kt_signed_off === true,
    ktSignedOffAt: row.kt_signed_off_at,
    relievingLetterUrl: row.relieving_letter_url,
    experienceLetterUrl: row.experience_letter_url,
    createdAt: row.created_at,
    clearances: mapClearances(row.clearances),
  };
}

function mapInterview(row) {
  if (!row) return null;
  return {
    employeeSelfAssessment: row.employee_self_assessment || null,
    hrInterviewNotes: row.hr_interview_notes,
    finalReason: row.final_reason,
    employeeSubmittedAt: row.employee_submitted_at,
    hrRecordedAt: row.hr_recorded_at,
  };
}

function mapKtTask(row) {
  return {
    id: row.id,
    exitRequestId: row.exit_request_id,
    title: row.title,
    description: row.description,
    handoverOwnerId: row.handover_owner_id,
    handoverOwnerName: row.handover_owner_name || null,
    assignedBy: row.assigned_by,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

async function notifyManagers(employeeId, message, subjectEmployeeId) {
  const managers = await employeeManagers(employeeId);
  for (const managerId of managers) {
    await createNotification(managerId, 'exit_clearance', message, { subjectEmployeeId });
  }
}

async function notifyHrAdmins(message, subjectEmployeeId) {
  const { rows } = await pool.query(
    `
      SELECT id FROM employees
      WHERE COALESCE(isregistered, TRUE) = TRUE
        AND role IN ('admin', 'founder')
    `
  );
  for (const row of rows) {
    await createNotification(row.id, 'exit_clearance', message, { subjectEmployeeId });
  }
}

async function allClearancesApproved(exitRequestId) {
  const { rows } = await pool.query(
    `
      SELECT BOOL_AND(status = 'approved') AS ok, COUNT(*)::int AS c
      FROM exit_clearances
      WHERE exit_request_id = $1 AND clearance_type = ANY($2::varchar[])
    `,
    [exitRequestId, CLEARANCE_TYPES]
  );
  return rows[0]?.ok === true && (rows[0]?.c || 0) >= CLEARANCE_TYPES.length;
}

async function deactivateEmployee(employeeId) {
  await pool.query(
    `
      UPDATE employees
      SET is_active = FALSE, isregistered = FALSE, employment_status = 'exited'
      WHERE id = $1
    `,
    [employeeId]
  );
}

module.exports = {
  CLEARANCE_TYPES,
  ACTIVE_EXIT_STATUSES,
  EXIT_TYPES,
  ensureExitWorkflowSchema,
  employeeManagers,
  seedClearances,
  getActiveExitForEmployee,
  getExitInterview,
  getKtTasks,
  getManagerSubmission,
  mapExitRow,
  mapInterview,
  mapKtTask,
  notifyManagers,
  notifyHrAdmins,
  allClearancesApproved,
  deactivateEmployee,
};
