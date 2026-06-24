const express = require('express');
const { pool } = require('../db');
const {
  authMiddleware,
  enforceForcePasswordChange,
  requirePortalAdmin,
  requireRoles,
} = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { isAdminRole } = require('../constants/roles');
const { getExitNoticeSummary } = require('../utils/exitNoticeSummary');
const { generateRelievingLetter, generateExperienceLetter } = require('../utils/exitLetters');
const {
  CLEARANCE_TYPES,
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
} = require('../utils/exitHelpers');

const router = express.Router();
const SELF_EXIT_ROLES = ['employee', 'manager', 'admin', 'founder', 'it_head'];
router.use(authMiddleware);
router.use(enforceForcePasswordChange);
router.use(async (_req, _res, next) => {
  try {
    await ensureExitWorkflowSchema();
    next();
  } catch (err) {
    next(err);
  }
});

async function loadExitBundle(employeeId) {
  const row = await getActiveExitForEmployee(employeeId);
  if (!row) return null;
  const interview = await getExitInterview(row.id);
  const ktTasks = await getKtTasks(row.id);
  const submission = await getManagerSubmission(row.id);
  const noticeSummary =
    ['serving_notice', 'clearances_pending', 'letters_ready', 'in_progress'].includes(row.status)
      ? await getExitNoticeSummary(employeeId, row)
      : null;
  const assets = await pool.query(
    `
      SELECT aa.id, ii.name, aa.status, aa.allocated_at
      FROM asset_allocations aa
      JOIN inventory_items ii ON ii.id = aa.inventory_item_id
      WHERE aa.employee_id = $1
      ORDER BY aa.allocated_at DESC
    `,
    [employeeId]
  );
  return {
    request: mapExitRow(row),
    interview: mapInterview(interview),
    ktTasks: ktTasks.map(mapKtTask),
    managerSubmission: submission
      ? {
          knowledgeTransferSummary: submission.knowledge_transfer_summary,
          pendingTasksStatus: submission.pending_tasks_status,
          handoverPersonName: submission.handover_person_name,
          confirmed: submission.confirmed,
          submittedAt: submission.submitted_at,
        }
      : null,
    noticeSummary,
    assets: assets.rows.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      allocatedAt: a.allocated_at,
    })),
  };
}

async function tryMarkLettersReady(exitRequestId) {
  if (!(await allClearancesApproved(exitRequestId))) return false;
  await pool.query(
    `UPDATE exit_requests SET status = 'clearances_pending' WHERE id = $1 AND status = 'serving_notice'`,
    [exitRequestId]
  );
  return true;
}

/** GET /api/exit/my */
router.get('/my', requireRoles(...SELF_EXIT_ROLES), async (req, res) => {
  try {
    const bundle = await loadExitBundle(req.user.id);
    if (!bundle) return res.json({ request: null });
    return res.json(bundle);
  } catch (err) {
    console.error('GET /exit/my:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST /api/exit/request — employee submits exit request */
router.post('/request', requireRoles(...SELF_EXIT_ROLES), async (req, res) => {
  try {
    const exitType = String(req.body?.exitType || 'resignation').toLowerCase();
    const reason = String(req.body?.reason || '').trim();
    const requestedLastWorkingDay = String(req.body?.requestedLastWorkingDay || '').trim();

    if (!EXIT_TYPES.includes(exitType)) {
      return res.status(400).json({ message: `exitType must be one of: ${EXIT_TYPES.join(', ')}` });
    }
    if (!reason) return res.status(400).json({ message: 'reason is required' });
    if (!requestedLastWorkingDay) {
      return res.status(400).json({ message: 'requestedLastWorkingDay is required' });
    }

    const existing = await getActiveExitForEmployee(req.user.id);
    if (existing) {
      return res.status(409).json({ message: 'You already have an active exit request' });
    }

    const insert = await pool.query(
      `
        INSERT INTO exit_requests (
          employee_id, exit_type, employee_reason, reason,
          requested_last_working_day, status
        )
        VALUES ($1, $2, $3, $3, $4::date, 'pending_hr_review')
        RETURNING *
      `,
      [req.user.id, exitType, reason, requestedLastWorkingDay]
    );
    const exitRequest = insert.rows[0];
    await pool.query(
      `
        INSERT INTO exit_interviews (exit_request_id)
        VALUES ($1)
        ON CONFLICT (exit_request_id) DO NOTHING
      `,
      [exitRequest.id]
    );

    const empName = req.user.name || 'Employee';
    await notifyHrAdmins(
      `${empName} submitted an exit request (${exitType}). Review in Admin → Exit Formalities.`,
      req.user.id
    );

    return res.status(201).json({
      request: mapExitRow({ ...exitRequest, clearances: [] }),
      message: 'Exit request submitted. HR will review and confirm your last working day.',
    });
  } catch (err) {
    console.error('POST /exit/request:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST /api/exit/initiate — admin initiates (skips HR review) */
router.post('/initiate', requirePortalAdmin, async (req, res) => {
  try {
    const employeeId = Number(req.body?.employeeId);
    const lastWorkingDay = String(req.body?.lastWorkingDay || '').trim();
    const reason = String(req.body?.reason || '').trim();
    const exitType = String(req.body?.exitType || 'termination').toLowerCase();

    if (!Number.isFinite(employeeId)) {
      return res.status(400).json({ message: 'employeeId is required' });
    }
    if (!lastWorkingDay || !reason) {
      return res.status(400).json({ message: 'lastWorkingDay and reason are required' });
    }

    const existing = await getActiveExitForEmployee(employeeId);
    if (existing) {
      return res.status(409).json({ message: 'This employee already has an active exit request' });
    }

    const empRes = await pool.query('SELECT id, name FROM employees WHERE id = $1', [employeeId]);
    if (!empRes.rows[0]) return res.status(404).json({ message: 'Employee not found' });

    const insert = await pool.query(
      `
        INSERT INTO exit_requests (
          employee_id, initiated_by_admin, exit_type, status,
          last_working_day, confirmed_last_working_day, requested_last_working_day,
          reason, employee_reason, reviewed_by, reviewed_at
        )
        VALUES ($1, $2, $3, 'serving_notice', $4::date, $4::date, $4::date, $5, $5, $2, NOW())
        RETURNING *
      `,
      [employeeId, req.user.id, exitType, lastWorkingDay, reason]
    );
    const exitRequest = insert.rows[0];
    await pool.query(
      `UPDATE employees SET employment_status = 'serving_notice' WHERE id = $1`,
      [employeeId]
    );
    await seedClearances(exitRequest.id);
    await pool.query(
      `INSERT INTO exit_interviews (exit_request_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [exitRequest.id]
    );

    const emp = empRes.rows[0];
    await createNotification(
      employeeId,
      'exit_initiated',
      `Your exit process has been initiated. Last working day: ${lastWorkingDay}.`,
      { subjectEmployeeId: employeeId }
    );
    await notifyManagers(
      employeeId,
      `Exit initiated for ${emp.name}. Last working day: ${lastWorkingDay}.`,
      employeeId
    );

    return res.status(201).json({ request: mapExitRow({ ...exitRequest, clearances: [] }) });
  } catch (err) {
    console.error('POST /exit/initiate:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** GET /api/exit/admin/requests — pending HR review */
router.get('/admin/requests', requirePortalAdmin, async (req, res) => {
  try {
    const viewerId = Number(req.user.id);
    const { rows } = await pool.query(
      `
        SELECT er.*, e.name, e.employeecode, e.department, e.designation
        FROM exit_requests er
        JOIN employees e ON e.id = er.employee_id
        WHERE er.status = 'pending_hr_review'
          AND er.employee_id <> $1
        ORDER BY er.created_at ASC
      `,
      [viewerId]
    );
    return res.json({
      items: rows.map((r) => ({
        ...mapExitRow({ ...r, clearances: [] }),
        employee: {
          id: r.employee_id,
          name: r.name,
          employeecode: r.employeecode,
          department: r.department,
          designation: r.designation,
        },
      })),
    });
  } catch (err) {
    console.error('GET /exit/admin/requests:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PUT /api/exit/admin/review/:id — HR approves / rejects */
router.put('/admin/review/:id', requirePortalAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const action = String(req.body?.action || 'approve').toLowerCase();
    const confirmedLastWorkingDay = String(req.body?.confirmedLastWorkingDay || '').trim();
    const hrNotes = req.body?.hrNotes != null ? String(req.body.hrNotes).trim() : null;

    const { rows } = await pool.query(`SELECT * FROM exit_requests WHERE id = $1`, [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Exit request not found' });
    if (row.status !== 'pending_hr_review') {
      return res.status(400).json({ message: 'Request is not pending HR review' });
    }
    if (row.employee_id === req.user.id) {
      return res.status(403).json({ message: 'You cannot review your own exit request' });
    }

    if (action === 'reject') {
      await pool.query(
        `UPDATE exit_requests SET status = 'rejected', hr_notes = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $1`,
        [id, hrNotes, req.user.id]
      );
      await createNotification(
        row.employee_id,
        'exit_clearance',
        'Your exit request was not approved. Please contact HR for details.',
        { subjectEmployeeId: row.employee_id }
      );
      return res.json({ message: 'Exit request rejected' });
    }

    if (!confirmedLastWorkingDay) {
      return res.status(400).json({ message: 'confirmedLastWorkingDay is required' });
    }

    await pool.query(
      `
        UPDATE exit_requests SET
          status = 'serving_notice',
          confirmed_last_working_day = $2::date,
          last_working_day = $2::date,
          hr_notes = $3,
          reviewed_by = $4,
          reviewed_at = NOW()
        WHERE id = $1
      `,
      [id, confirmedLastWorkingDay, hrNotes, req.user.id]
    );
    await pool.query(
      `UPDATE employees SET employment_status = 'serving_notice' WHERE id = $1`,
      [row.employee_id]
    );
    await seedClearances(id);
    await pool.query(
      `INSERT INTO exit_interviews (exit_request_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [id]
    );

    const empRes = await pool.query('SELECT name FROM employees WHERE id = $1', [row.employee_id]);
    const name = empRes.rows[0]?.name || 'Employee';
    await createNotification(
      row.employee_id,
      'exit_initiated',
      `Your exit request is approved. Last working day: ${confirmedLastWorkingDay}.`,
      { subjectEmployeeId: row.employee_id }
    );
    await notifyManagers(
      row.employee_id,
      `${name} is serving notice. Last working day: ${confirmedLastWorkingDay}.`,
      row.employee_id
    );

    return res.json({ message: 'Exit request approved — employee is now serving notice' });
  } catch (err) {
    console.error('PUT /exit/admin/review/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PUT /api/exit/admin/interview/:exitRequestId */
router.put('/admin/interview/:exitRequestId', requirePortalAdmin, async (req, res) => {
  try {
    const exitRequestId = Number(req.params.exitRequestId);
    const hrInterviewNotes = String(req.body?.hrInterviewNotes || '').trim();
    const finalReason = String(req.body?.finalReason || '').trim();
    if (!hrInterviewNotes) return res.status(400).json({ message: 'hrInterviewNotes is required' });

    await pool.query(
      `
        INSERT INTO exit_interviews (exit_request_id, hr_interview_notes, final_reason, hr_recorded_at, hr_recorded_by)
        VALUES ($1, $2, $3, NOW(), $4)
        ON CONFLICT (exit_request_id) DO UPDATE SET
          hr_interview_notes = EXCLUDED.hr_interview_notes,
          final_reason = COALESCE(EXCLUDED.final_reason, exit_interviews.final_reason),
          hr_recorded_at = NOW(),
          hr_recorded_by = EXCLUDED.hr_recorded_by
      `,
      [exitRequestId, hrInterviewNotes, finalReason || null, req.user.id]
    );
    return res.json({ message: 'Interview notes saved' });
  } catch (err) {
    console.error('PUT /exit/admin/interview:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST /api/exit/interview — employee self-assessment */
router.post('/interview', requireRoles(...SELF_EXIT_ROLES), async (req, res) => {
  try {
    const exitRequestId = Number(req.body?.exitRequestId);
    const assessment = req.body?.selfAssessment || {};
    if (!Number.isFinite(exitRequestId)) {
      return res.status(400).json({ message: 'exitRequestId is required' });
    }

    const exitRes = await pool.query(
      `SELECT * FROM exit_requests WHERE id = $1 AND employee_id = $2`,
      [exitRequestId, req.user.id]
    );
    if (!exitRes.rows[0]) return res.status(404).json({ message: 'Exit request not found' });

    await pool.query(
      `
        INSERT INTO exit_interviews (exit_request_id, employee_self_assessment, employee_submitted_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (exit_request_id) DO UPDATE SET
          employee_self_assessment = EXCLUDED.employee_self_assessment,
          employee_submitted_at = NOW()
      `,
      [exitRequestId, JSON.stringify(assessment)]
    );
    await notifyHrAdmins('Exit interview self-assessment submitted.', req.user.id);
    return res.json({ message: 'Exit interview submitted' });
  } catch (err) {
    console.error('POST /exit/interview:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST /api/exit/kt-tasks */
router.post('/kt-tasks', requireRoles(...SELF_EXIT_ROLES), async (req, res) => {
  try {
    const exitRequestId = Number(req.body?.exitRequestId);
    const title = String(req.body?.title || '').trim();
    const description = req.body?.description != null ? String(req.body.description).trim() : null;
    if (!Number.isFinite(exitRequestId) || !title) {
      return res.status(400).json({ message: 'exitRequestId and title are required' });
    }

    const exitRes = await pool.query(
      `SELECT * FROM exit_requests WHERE id = $1 AND employee_id = $2`,
      [exitRequestId, req.user.id]
    );
    if (!exitRes.rows[0]) return res.status(404).json({ message: 'Exit request not found' });

    const { rows } = await pool.query(
      `
        INSERT INTO kt_tasks (exit_request_id, title, description, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING *
      `,
      [exitRequestId, title, description]
    );
    await notifyManagers(req.user.id, 'New knowledge-transfer task added for exit.', req.user.id);
    return res.status(201).json({ task: mapKtTask(rows[0]) });
  } catch (err) {
    console.error('POST /exit/kt-tasks:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PATCH /api/exit/kt-tasks/:id/assign — manager */
router.patch('/kt-tasks/:id/assign', requireRoles('manager', 'admin', 'founder'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const handoverOwnerId = Number(req.body?.handoverOwnerId);
    if (!Number.isFinite(id) || !Number.isFinite(handoverOwnerId)) {
      return res.status(400).json({ message: 'handoverOwnerId is required' });
    }

    const taskRes = await pool.query(
      `
        SELECT kt.*, er.employee_id
        FROM kt_tasks kt
        JOIN exit_requests er ON er.id = kt.exit_request_id
        WHERE kt.id = $1
      `,
      [id]
    );
    const task = taskRes.rows[0];
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const role = String(req.user.role || '').toLowerCase();
    if (role === 'manager') {
      const mgr = await pool.query(
        'SELECT 1 FROM manageremployees WHERE managerid = $1 AND employeeid = $2 LIMIT 1',
        [req.user.id, task.employee_id]
      );
      if (!mgr.rows[0]) return res.status(403).json({ message: 'Not your team member' });
    }

    await pool.query(
      `
        UPDATE kt_tasks
        SET handover_owner_id = $2, assigned_by = $3, status = 'assigned', completed_at = NULL
        WHERE id = $1
      `,
      [id, handoverOwnerId, req.user.id]
    );
    await createNotification(
      handoverOwnerId,
      'exit_clearance',
      'You have been assigned a knowledge-transfer task.',
      { subjectEmployeeId: task.employee_id }
    );
    return res.json({ message: 'Task assigned' });
  } catch (err) {
    console.error('PATCH /exit/kt-tasks/assign:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PATCH /api/exit/kt-tasks/:id/complete */
router.patch('/kt-tasks/:id/complete', requireRoles('manager', 'admin', 'founder', 'employee'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `
        SELECT kt.*, er.employee_id
        FROM kt_tasks kt
        JOIN exit_requests er ON er.id = kt.exit_request_id
        WHERE kt.id = $1
      `,
      [id]
    );
    const task = rows[0];
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const uid = req.user.id;
    const role = String(req.user.role || '').toLowerCase();
    const canComplete =
      isAdminRole(role) ||
      task.handover_owner_id === uid ||
      task.employee_id === uid ||
      (role === 'manager' &&
        (await pool.query(
          'SELECT 1 FROM manageremployees WHERE managerid = $1 AND employeeid = $2',
          [uid, task.employee_id]
        )).rows[0]);
    if (!canComplete) return res.status(403).json({ message: 'Not authorized' });

    await pool.query(
      `UPDATE kt_tasks SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [id]
    );
    return res.json({ message: 'Task marked complete' });
  } catch (err) {
    console.error('PATCH /exit/kt-tasks/complete:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST /api/exit/kt-signoff/:exitRequestId — manager KT sign-off */
router.post('/kt-signoff/:exitRequestId', requireRoles('manager', 'admin', 'founder'), async (req, res) => {
  try {
    const exitRequestId = Number(req.params.exitRequestId);
    const { rows } = await pool.query(`SELECT * FROM exit_requests WHERE id = $1`, [exitRequestId]);
    const exitRow = rows[0];
    if (!exitRow) return res.status(404).json({ message: 'Exit request not found' });

    const kt = await getKtTasks(exitRequestId);
    if (kt.length > 0 && kt.some((t) => t.status !== 'completed')) {
      return res.status(400).json({ message: 'All KT tasks must be completed before sign-off' });
    }

    const role = String(req.user.role || '').toLowerCase();
    if (role === 'manager') {
      const mgr = await pool.query(
        'SELECT 1 FROM manageremployees WHERE managerid = $1 AND employeeid = $2',
        [req.user.id, exitRow.employee_id]
      );
      if (!mgr.rows[0]) return res.status(403).json({ message: 'Not your team member' });
    }

    await pool.query(
      `
        UPDATE exit_requests
        SET kt_signed_off = TRUE, kt_signed_off_by = $2, kt_signed_off_at = NOW()
        WHERE id = $1
      `,
      [exitRequestId, req.user.id]
    );
    return res.json({ message: 'Knowledge transfer signed off' });
  } catch (err) {
    console.error('POST /exit/kt-signoff:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST /api/exit/manager-form — legacy handover summary */
router.post('/manager-form', requireRoles(...SELF_EXIT_ROLES), async (req, res) => {
  try {
    const exitRequestId = Number(req.body?.exitRequestId);
    const knowledgeTransferSummary = String(req.body?.knowledgeTransferSummary || '').trim();
    const pendingTasksStatus = String(req.body?.pendingTasksStatus || '').trim();
    const handoverPersonName = String(req.body?.handoverPersonName || '').trim();
    const confirmed = Boolean(req.body?.confirmed);

    if (!Number.isFinite(exitRequestId) || !knowledgeTransferSummary || !pendingTasksStatus || !handoverPersonName) {
      return res.status(400).json({ message: 'All handover fields are required' });
    }
    if (!confirmed) return res.status(400).json({ message: 'Confirmation required' });

    const exitRes = await pool.query(
      `SELECT * FROM exit_requests WHERE id = $1 AND employee_id = $2`,
      [exitRequestId, req.user.id]
    );
    if (!exitRes.rows[0]) return res.status(404).json({ message: 'Exit request not found' });

    await pool.query(
      `
        INSERT INTO exit_manager_submissions (
          exit_request_id, knowledge_transfer_summary, pending_tasks_status,
          handover_person_name, confirmed
        )
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (exit_request_id) DO UPDATE SET
          knowledge_transfer_summary = EXCLUDED.knowledge_transfer_summary,
          pending_tasks_status = EXCLUDED.pending_tasks_status,
          handover_person_name = EXCLUDED.handover_person_name,
          confirmed = EXCLUDED.confirmed,
          submitted_at = NOW()
      `,
      [exitRequestId, knowledgeTransferSummary, pendingTasksStatus, handoverPersonName]
    );
    await notifyManagers(req.user.id, `${req.user.name || 'Employee'} submitted handover details.`, req.user.id);
    return res.json({ message: 'Handover form submitted' });
  } catch (err) {
    console.error('POST /exit/manager-form:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST /api/exit/admin/return-assets/:employeeId */
router.post('/admin/return-assets/:employeeId', requirePortalAdmin, async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    await pool.query(
      `UPDATE asset_allocations SET status = 'returned', updated_at = NOW() WHERE employee_id = $1 AND status = 'active'`,
      [employeeId]
    );
    return res.json({ message: 'All active assets marked as returned' });
  } catch (err) {
    console.error('POST /exit/admin/return-assets:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST /api/exit/admin/letters/:exitRequestId */
router.post('/admin/letters/:exitRequestId', requirePortalAdmin, async (req, res) => {
  try {
    const exitRequestId = Number(req.params.exitRequestId);
    const { rows } = await pool.query(
      `
        SELECT er.*, e.id AS eid, e.name, e.employeecode, e.department, e.designation, e.createdat
        FROM exit_requests er
        JOIN employees e ON e.id = er.employee_id
        WHERE er.id = $1
      `,
      [exitRequestId]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Exit request not found' });
    if (!(await allClearancesApproved(exitRequestId))) {
      return res.status(400).json({ message: 'All department clearances must be approved first' });
    }

    const employee = {
      id: row.eid,
      name: row.name,
      employeecode: row.employeecode,
      department: row.department,
      designation: row.designation,
      createdat: row.createdat,
    };
    const relievingUrl = await generateRelievingLetter(employee, row);
    const experienceUrl = await generateExperienceLetter(employee, row);

    await pool.query(
      `
        UPDATE exit_requests
        SET relieving_letter_url = $2, experience_letter_url = $3, status = 'letters_ready'
        WHERE id = $1
      `,
      [exitRequestId, relievingUrl, experienceUrl]
    );
    await createNotification(
      row.employee_id,
      'exit_clearance',
      'Your relieving and experience letters are ready in the Exit portal.',
      { subjectEmployeeId: row.employee_id }
    );
    return res.json({ relievingLetterUrl: relievingUrl, experienceLetterUrl: experienceUrl });
  } catch (err) {
    console.error('POST /exit/admin/letters:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** GET /api/exit/manager/pending */
router.get('/manager/pending', requireRoles('manager', 'admin', 'founder'), async (req, res) => {
  try {
    const role = String(req.user.role || '').toLowerCase();
    let rows;
    if (isAdminRole(role) || req.user.adminId) {
      const q = await pool.query(
        `
          SELECT ec.id AS clearance_id, ec.status, ec.remarks, ec.updated_at,
                 er.id AS exit_request_id, er.last_working_day, er.reason, er.kt_signed_off,
                 e.id AS employee_id, e.name AS employee_name, e.employeecode
          FROM exit_clearances ec
          JOIN exit_requests er ON er.id = ec.exit_request_id
          JOIN employees e ON e.id = er.employee_id
          WHERE ec.clearance_type = 'manager'
            AND er.status IN ('serving_notice', 'clearances_pending', 'letters_ready', 'in_progress')
            AND e.id <> $1
          ORDER BY ec.updated_at DESC
        `,
        [req.user.id]
      );
      rows = q.rows;
    } else {
      const q = await pool.query(
        `
          SELECT ec.id AS clearance_id, ec.status, ec.remarks, ec.updated_at,
                 er.id AS exit_request_id, er.last_working_day, er.reason, er.kt_signed_off,
                 e.id AS employee_id, e.name AS employee_name, e.employeecode
          FROM exit_clearances ec
          JOIN exit_requests er ON er.id = ec.exit_request_id
          JOIN employees e ON e.id = er.employee_id
          JOIN manageremployees me ON me.employeeid = e.id AND me.managerid = $1
          WHERE ec.clearance_type = 'manager'
            AND er.status IN ('serving_notice', 'clearances_pending', 'letters_ready', 'in_progress')
            AND e.id <> $1
          ORDER BY ec.updated_at DESC
        `,
        [req.user.id]
      );
      rows = q.rows;
    }

    const items = await Promise.all(
      rows.map(async (r) => {
        const ktTasks = await getKtTasks(r.exit_request_id);
        const submission = await getManagerSubmission(r.exit_request_id);
        return {
          clearanceId: r.clearance_id,
          status: r.status,
          exitRequestId: r.exit_request_id,
          lastWorkingDay: r.last_working_day,
          ktSignedOff: r.kt_signed_off === true,
          employee: { id: r.employee_id, name: r.employee_name, employeecode: r.employeecode },
          ktTasks: ktTasks.map(mapKtTask),
          submission: submission
            ? {
                knowledgeTransferSummary: submission.knowledge_transfer_summary,
                pendingTasksStatus: submission.pending_tasks_status,
                handoverPersonName: submission.handover_person_name,
                confirmed: submission.confirmed,
              }
            : null,
        };
      })
    );
    return res.json({ items });
  } catch (err) {
    console.error('GET /exit/manager/pending:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** GET /api/exit/admin/pending?type=it|finance|admin */
router.get('/admin/pending', requirePortalAdmin, async (req, res) => {
  try {
    const type = String(req.query.type || 'it').toLowerCase();
    if (!['it', 'finance', 'admin', 'hr'].includes(type)) {
      return res.status(400).json({ message: 'type must be it, finance, admin, or hr' });
    }
    const clearanceType = type === 'hr' ? 'admin' : type;

    const { rows } = await pool.query(
      `
        SELECT ec.id AS clearance_id, ec.status, ec.remarks, ec.updated_at,
               er.id AS exit_request_id, er.last_working_day, er.reason,
               er.relieving_letter_url, er.experience_letter_url,
               e.id AS employee_id, e.name AS employee_name, e.employeecode,
               (
                 SELECT COUNT(*)::int FROM asset_allocations aa
                 WHERE aa.employee_id = e.id AND aa.status = 'active'
               ) AS active_assets,
               ei.hr_interview_notes, ei.final_reason, ei.employee_submitted_at
        FROM exit_clearances ec
        JOIN exit_requests er ON er.id = ec.exit_request_id
        JOIN employees e ON e.id = er.employee_id
        LEFT JOIN exit_interviews ei ON ei.exit_request_id = er.id
        WHERE ec.clearance_type = $1
          AND er.status IN ('serving_notice', 'clearances_pending', 'letters_ready', 'in_progress', 'pending_hr_review')
        ORDER BY ec.updated_at DESC
      `,
      [clearanceType]
    );

    return res.json({
      items: rows.map((r) => ({
        clearanceId: r.clearance_id,
        status: r.status,
        exitRequestId: r.exit_request_id,
        lastWorkingDay: r.last_working_day,
        activeAssets: r.active_assets,
        relievingLetterUrl: r.relieving_letter_url,
        experienceLetterUrl: r.experience_letter_url,
        interview: {
          hrInterviewNotes: r.hr_interview_notes,
          finalReason: r.final_reason,
          employeeSubmittedAt: r.employee_submitted_at,
        },
        employee: { id: r.employee_id, name: r.employee_name, employeecode: r.employeecode },
      })),
    });
  } catch (err) {
    console.error('GET /exit/admin/pending:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** GET /api/exit/admin/all — overview for HR */
router.get('/admin/all', requirePortalAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT er.*, e.name, e.employeecode, e.employment_status
        FROM exit_requests er
        JOIN employees e ON e.id = er.employee_id
        WHERE er.status NOT IN ('completed', 'rejected', 'cancelled')
        ORDER BY er.created_at DESC
      `
    );
    const items = await Promise.all(
      rows.map(async (r) => ({
        ...mapExitRow({ ...r, clearances: [] }),
        employeeName: r.name,
        employeecode: r.employeecode,
        allClearancesApproved: await allClearancesApproved(r.id),
      }))
    );
    return res.json({ items });
  } catch (err) {
    console.error('GET /exit/admin/all:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PUT /api/exit/clearance/:id */
router.put('/clearance/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '').toLowerCase();
    const remarks = req.body?.remarks != null ? String(req.body.remarks).trim() : null;
    if (!Number.isFinite(id) || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid clearance update' });
    }

    const { rows } = await pool.query(
      `
        SELECT ec.*, er.employee_id, er.id AS exit_request_id, er.kt_signed_off, e.name AS employee_name
        FROM exit_clearances ec
        JOIN exit_requests er ON er.id = ec.exit_request_id
        JOIN employees e ON e.id = er.employee_id
        WHERE ec.id = $1
      `,
      [id]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Clearance not found' });

    const role = String(req.user.role || '').toLowerCase();
    const isAdmin = isAdminRole(role) || req.user.adminId;

    if (row.clearance_type === 'manager') {
      if (role !== 'manager' && !isAdmin) {
        return res.status(403).json({ message: 'Manager approval required' });
      }
      if (role === 'manager') {
        const mgr = await pool.query(
          'SELECT 1 FROM manageremployees WHERE managerid = $1 AND employeeid = $2 LIMIT 1',
          [req.user.id, row.employee_id]
        );
        if (!mgr.rows[0]) return res.status(403).json({ message: 'Not your team member' });
      }
      if (status === 'approved' && !row.kt_signed_off) {
        return res.status(400).json({ message: 'Manager must sign off knowledge transfer first' });
      }
    } else if (row.clearance_type === 'it') {
      if (!isAdmin && role !== 'it_head') {
        return res.status(403).json({ message: 'Admin or IT head required' });
      }
      if (status === 'approved') {
        const assets = await pool.query(
          `SELECT COUNT(*)::int AS c FROM asset_allocations WHERE employee_id = $1 AND status = 'active'`,
          [row.employee_id]
        );
        if ((assets.rows[0]?.c || 0) > 0) {
          return res.status(400).json({ message: 'All assets must be returned before IT clearance' });
        }
      }
    } else if (row.clearance_type === 'finance' || row.clearance_type === 'admin') {
      if (!isAdmin) return res.status(403).json({ message: 'Admin required' });
    } else if (row.clearance_type === 'hr') {
      if (!isAdmin) return res.status(403).json({ message: 'Admin required' });
    }

    await pool.query(
      `UPDATE exit_clearances SET status = $2, approved_by = $3, remarks = $4, updated_at = NOW() WHERE id = $1`,
      [id, status, req.user.id, remarks]
    );

    if (status === 'approved') {
      await createNotification(
        row.employee_id,
        'exit_clearance',
        `Your ${row.clearance_type.toUpperCase()} clearance has been approved.`,
        { subjectEmployeeId: row.employee_id }
      );
      await tryMarkLettersReady(row.exit_request_id);
      if (await allClearancesApproved(row.exit_request_id)) {
        await notifyHrAdmins(
          `All clearances complete for ${row.employee_name}. Generate relieving letters.`,
          row.employee_id
        );
      }
    }

    return res.json({ message: `Clearance ${status}` });
  } catch (err) {
    console.error('PUT /exit/clearance/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
