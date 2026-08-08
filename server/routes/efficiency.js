const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { pool } = require('../db');
const {
  requireRoles,
  requireAnyAdmin,
  enforcePasswordChange,
} = require('../middleware/auth');
const {
  computeManhoursPerUnit,
  buildEfficiencyReport,
  buildDailyInputsReport,
  resolvePeriodRange,
} = require('../utils/efficiencyMetrics');
const { WD_INTEGRATION_PROPOSAL, isWdIntegrationConfirmed } = require('../utils/efficiencyWorkingDays');
const {
  parseEfficiencyWorkbookBuffer,
  applyEfficiencyImport,
  buildImportTemplateBuffer,
} = require('../utils/efficiencyProjectImport');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function uploadSingle(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
      return next();
    });
  };
}

const router = express.Router();
router.use(enforcePasswordChange);

async function resolveEmployeeManagerId(employeeId) {
  const mgr = await pool.query(
    'SELECT managerid FROM manageremployees WHERE employeeid = $1 LIMIT 1',
    [employeeId]
  );
  if (mgr.rows[0]?.managerid) return mgr.rows[0].managerid;
  const emp = await pool.query('SELECT reporting_to_id FROM employees WHERE id = $1 LIMIT 1', [employeeId]);
  return emp.rows[0]?.reporting_to_id || null;
}

async function ensureManagedPendingWorkLog(managerId, workLogId) {
  const { rows } = await pool.query(
    `
      SELECT wl.*
      FROM work_logs wl
      JOIN manageremployees me ON me.employeeid = wl.employee_id AND me.managerid = $1
      WHERE wl.id = $2
      LIMIT 1
    `,
    [managerId, workLogId]
  );
  const log = rows[0];
  if (!log) {
    const err = new Error('Work log not found or not assigned to you');
    err.status = 404;
    throw err;
  }
  if (String(log.status).toLowerCase() !== 'pending') {
    const err = new Error('Only pending work logs can be approved or rejected');
    err.status = 400;
    throw err;
  }
  return log;
}

/** Admin portal accounts and managers can configure projects / task baselines. */
function requireEfficiencyConfigurator(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase().trim();
  if (role === 'manager') return next();
  return requireAnyAdmin(req, res, next);
}

/** Admin and managers can view daily inputs and efficiency reports. */
function requireEfficiencyViewer(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase().trim();
  if (role === 'manager') return next();
  return requireAnyAdmin(req, res, next);
}

async function managerReporteeIds(managerId) {
  const { rows } = await pool.query(
    'SELECT employeeid FROM manageremployees WHERE managerid = $1',
    [managerId]
  );
  return rows.map((r) => r.employeeid);
}

async function efficiencyViewerFilters(req) {
  const role = String(req.user?.role || '').toLowerCase().trim();
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;

  if (role === 'manager') {
    const reporteeIds = await managerReporteeIds(req.user.id);
    if (employeeId && !reporteeIds.includes(employeeId)) {
      const err = new Error('You can only view efficiency data for your assigned reportees');
      err.status = 403;
      throw err;
    }
    return {
      employeeId: employeeId || null,
      projectId: projectId || null,
      employeeIds: employeeId ? null : reporteeIds,
    };
  }

  return {
    employeeId: employeeId || null,
    projectId: projectId || null,
    employeeIds: null,
  };
}

router.get('/efficiency-projects', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM efficiency_projects ORDER BY name ASC'
    );
    return res.json({ projects: rows });
  } catch (err) {
    console.error('GET /efficiency-projects:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/efficiency-projects', requireEfficiencyConfigurator, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ message: 'name is required' });
  try {
    const { rows } = await pool.query(
      `
        INSERT INTO efficiency_projects (name)
        VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, name
      `,
      [name]
    );
    return res.status(201).json({ project: rows[0] });
  } catch (err) {
    console.error('POST /efficiency-projects:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/efficiency-projects/:id', requireEfficiencyConfigurator, async (req, res) => {
  const projectId = Number(req.params.id);
  const name = String(req.body?.name || '').trim();
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id' });
  if (!name) return res.status(400).json({ message: 'name is required' });
  try {
    const { rows } = await pool.query(
      `
        UPDATE efficiency_projects SET name = $1 WHERE id = $2
        RETURNING id, name
      `,
      [name, projectId]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Project not found' });
    await pool.query('UPDATE task_baselines SET project_name = $1 WHERE project_id = $2', [name, projectId]);
    return res.json({ project: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A project with this name already exists' });
    }
    console.error('PATCH /efficiency-projects/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/efficiency-projects/:id', requireEfficiencyConfigurator, async (req, res) => {
  const projectId = Number(req.params.id);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id' });
  try {
    const proj = await pool.query('SELECT id, name FROM efficiency_projects WHERE id = $1', [projectId]);
    if (!proj.rows[0]) return res.status(404).json({ message: 'Project not found' });

    const logs = await pool.query(
      'SELECT COUNT(*)::int AS count FROM work_logs WHERE project_id = $1',
      [projectId]
    );
    if (logs.rows[0]?.count > 0) {
      return res.status(409).json({
        message: `Cannot delete "${proj.rows[0].name}" — ${logs.rows[0].count} work log(s) exist for this project. Remove or reassign logs first.`,
      });
    }

    await pool.query('DELETE FROM efficiency_projects WHERE id = $1', [projectId]);
    return res.json({ message: 'Project deleted', projectId, name: proj.rows[0].name });
  } catch (err) {
    console.error('DELETE /efficiency-projects/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/task-baselines/:id', requireEfficiencyConfigurator, async (req, res) => {
  const baselineId = Number(req.params.id);
  if (!Number.isFinite(baselineId)) return res.status(400).json({ message: 'Invalid task baseline id' });
  try {
    const baseline = await pool.query(
      `
        SELECT tb.id, tb.task_name, tb.version_label, ep.name AS project_name
        FROM task_baselines tb
        JOIN efficiency_projects ep ON ep.id = tb.project_id
        WHERE tb.id = $1
      `,
      [baselineId]
    );
    if (!baseline.rows[0]) return res.status(404).json({ message: 'Task standard not found' });

    const logs = await pool.query(
      'SELECT COUNT(*)::int AS count FROM work_logs WHERE task_baseline_id = $1',
      [baselineId]
    );
    if (logs.rows[0]?.count > 0) {
      return res.status(409).json({
        message: `Cannot delete this task standard — ${logs.rows[0].count} work log(s) reference it.`,
      });
    }

    await pool.query('DELETE FROM task_baselines WHERE id = $1', [baselineId]);
    return res.json({ message: 'Task standard deleted', baselineId });
  } catch (err) {
    console.error('DELETE /task-baselines/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/efficiency-projects/import-template', requireEfficiencyConfigurator, (_req, res) => {
  try {
    const buf = buildImportTemplateBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="efficiency-projects-import-template.xlsx"');
    return res.send(buf);
  } catch (err) {
    console.error('GET /efficiency-projects/import-template:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/efficiency-projects/import',
  requireEfficiencyConfigurator,
  uploadSingle('file'),
  async (req, res) => {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ message: 'Excel file is required (.xlsx or .xls)' });
    }
    try {
      const rows = parseEfficiencyWorkbookBuffer(req.file.buffer);
      const summary = await applyEfficiencyImport(pool, rows, req.user?.id ?? null);
      return res.json({
        message: `Imported ${summary.baselinesUpserted} task standard(s) across ${summary.projectsUpserted} project(s)`,
        ...summary,
      });
    } catch (err) {
      console.error('POST /efficiency-projects/import:', err.message);
      return res.status(400).json({ message: err.message || 'Import failed' });
    }
  }
);

router.post('/task-baselines', requireEfficiencyConfigurator, async (req, res) => {
  try {
    const body = req.body || {};
    const projectId = Number(body.projectId);
    const projectName = String(body.projectName || '').trim();
    const taskName = String(body.taskName || '').trim();
    const versionLabel = String(body.versionLabel ?? body.version_label ?? '').trim();
    const unitLabel = String(body.unitLabel ?? body.unit_label ?? 'unit').trim() || 'unit';
    const calcType = String((body.calcType ?? body.calc_type) || '').toLowerCase();

    if (!taskName) return res.status(400).json({ message: 'taskName is required' });
    if (!['rate_based', 'weight_based'].includes(calcType)) {
      return res.status(400).json({ message: 'calcType must be rate_based or weight_based' });
    }

    let resolvedProjectId = Number.isFinite(projectId) ? projectId : null;
    let resolvedProjectName = projectName;

    if (!resolvedProjectId) {
      if (!resolvedProjectName) {
        return res.status(400).json({ message: 'projectId or projectName is required' });
      }
      const upsert = await pool.query(
        `
          INSERT INTO efficiency_projects (name)
          VALUES ($1)
          ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
          RETURNING id, name
        `,
        [resolvedProjectName]
      );
      resolvedProjectId = upsert.rows[0].id;
      resolvedProjectName = upsert.rows[0].name;
    } else {
      const proj = await pool.query('SELECT id, name FROM efficiency_projects WHERE id = $1', [
        resolvedProjectId,
      ]);
      if (!proj.rows[0]) return res.status(404).json({ message: 'Project not found' });
      resolvedProjectName = projectName || proj.rows[0].name;
    }

    const manhoursPerUnit = computeManhoursPerUnit({
      calcType,
      standardHours: body.standardHours ?? body.standard_hours,
      standardOutputQty: body.standardOutputQty ?? body.standard_output_qty,
      manhoursPerUnit: body.manhoursPerUnit ?? body.manhours_per_unit,
    });

    const baselineId = body.id != null ? Number(body.id) : null;
    let row;
    if (Number.isFinite(baselineId)) {
      const updated = await pool.query(
        `
          UPDATE task_baselines
          SET project_id = $1,
              project_name = $2,
              task_name = $3,
              version_label = $4,
              unit_label = $5,
              standard_output_qty = $6,
              standard_hours = $7,
              calc_type = $8,
              manhours_per_unit = $9
          WHERE id = $10
          RETURNING *
        `,
        [
          resolvedProjectId,
          resolvedProjectName,
          taskName,
          versionLabel,
          unitLabel,
          calcType === 'rate_based' ? body.standardOutputQty ?? body.standard_output_qty : null,
          calcType === 'rate_based' ? body.standardHours ?? body.standard_hours : null,
          calcType,
          manhoursPerUnit,
          baselineId,
        ]
      );
      if (!updated.rows[0]) return res.status(404).json({ message: 'Baseline not found' });
      row = updated.rows[0];
    } else {
      const inserted = await pool.query(
        `
          INSERT INTO task_baselines (
            project_id, project_name, task_name, version_label, unit_label,
            standard_output_qty, standard_hours, calc_type, manhours_per_unit, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (project_id, task_name, version_label)
          DO UPDATE SET
            project_name = EXCLUDED.project_name,
            unit_label = EXCLUDED.unit_label,
            standard_output_qty = EXCLUDED.standard_output_qty,
            standard_hours = EXCLUDED.standard_hours,
            calc_type = EXCLUDED.calc_type,
            manhours_per_unit = EXCLUDED.manhours_per_unit
          RETURNING *
        `,
        [
          resolvedProjectId,
          resolvedProjectName,
          taskName,
          versionLabel,
          unitLabel,
          calcType === 'rate_based' ? body.standardOutputQty ?? body.standard_output_qty : null,
          calcType === 'rate_based' ? body.standardHours ?? body.standard_hours : null,
          calcType,
          manhoursPerUnit,
          req.user.id,
        ]
      );
      row = inserted.rows[0];
    }

    return res.status(201).json({ baseline: row });
  } catch (err) {
    if (err.message?.includes('calc_type') || err.message?.includes('baseline')) {
      return res.status(400).json({ message: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A baseline with this project, task, and version already exists' });
    }
    console.error('POST /task-baselines:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/task-baselines/:projectId', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ message: 'Invalid projectId' });
  }
  try {
    const { rows } = await pool.query(
      `
        SELECT id, project_id, project_name, task_name, version_label, unit_label,
               standard_output_qty, standard_hours, calc_type, manhours_per_unit
        FROM task_baselines
        WHERE project_id = $1
        ORDER BY task_name ASC, version_label ASC
      `,
      [projectId]
    );
    return res.json({ baselines: rows });
  } catch (err) {
    console.error('GET /task-baselines/:projectId:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/work-logs', requireRoles('employee', 'manager', 'admin', 'it_head'), async (req, res) => {
  try {
    const body = req.body || {};
    const employeeId = req.user.id;
    const projectId = Number(body.projectId ?? body.project_id);
    const taskBaselineId = Number(body.taskBaselineId ?? body.task_baseline_id);
    const logDate = String(body.logDate ?? body.log_date ?? '').trim();
    const actualOutputQty = Number(body.actualOutputQty ?? body.actual_output_qty);
    const remarks = String(body.remarks ?? body.employeeRemarks ?? body.employee_remarks ?? '').trim() || null;
    const actualManhoursSpentRaw = body.actualManhoursSpent ?? body.actual_manhours_spent;
    const actualManhoursSpent =
      actualManhoursSpentRaw === undefined || actualManhoursSpentRaw === null || actualManhoursSpentRaw === ''
        ? null
        : Number(actualManhoursSpentRaw);

    if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'projectId is required' });
    if (!Number.isFinite(taskBaselineId)) {
      return res.status(400).json({ message: 'taskBaselineId is required' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      return res.status(400).json({ message: 'logDate must be YYYY-MM-DD' });
    }
    if (!Number.isFinite(actualOutputQty) || actualOutputQty <= 0) {
      return res.status(400).json({ message: 'actualOutputQty must be greater than 0' });
    }
    if (actualManhoursSpent != null && (!Number.isFinite(actualManhoursSpent) || actualManhoursSpent <= 0)) {
      return res.status(400).json({ message: 'actualManhoursSpent must be greater than 0' });
    }
    if (actualManhoursSpent == null) {
      return res.status(400).json({ message: 'actualManhoursSpent is required' });
    }

    let resolvedName = String(req.user?.name || '').trim();
    if (!resolvedName) {
      const emp = await pool.query('SELECT name FROM employees WHERE id = $1', [employeeId]);
      resolvedName = String(emp.rows[0]?.name || '').trim();
    }
    if (!resolvedName) return res.status(400).json({ message: 'Employee name could not be resolved' });

    const baseline = await pool.query(
      `
        SELECT tb.id, tb.project_id, tb.manhours_per_unit
        FROM task_baselines tb
        WHERE tb.id = $1 AND tb.project_id = $2
      `,
      [taskBaselineId, projectId]
    );
    if (!baseline.rows[0]) {
      return res.status(400).json({ message: 'Task baseline not found for this project' });
    }

    const managerId = await resolveEmployeeManagerId(employeeId);

    const { rows } = await pool.query(
      `
        INSERT INTO work_logs (
          employee_id, project_id, task_baseline_id, log_date, employee_name,
          actual_output_qty, actual_manhours_spent, remarks, status, manager_id
        )
        VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, 'pending', $9)
        RETURNING *
      `,
      [employeeId, projectId, taskBaselineId, logDate, resolvedName, actualOutputQty, actualManhoursSpent, remarks, managerId]
    );
    return res.status(201).json({ workLog: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        message: 'A work log already exists for this employee, project, task, and date',
      });
    }
    console.error('POST /work-logs:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/work-logs/pending', requireRoles('manager'), async (req, res) => {
  const managerId = Number(req.query.managerId);
  if (!Number.isFinite(managerId)) {
    return res.status(400).json({ message: 'managerId query parameter is required' });
  }
  if (managerId !== req.user.id) {
    return res.status(403).json({ message: 'You can only view pending logs for your own manager id' });
  }
  try {
    const { rows } = await pool.query(
      `
        SELECT
          wl.*,
          ep.name AS project_name,
          tb.task_name,
          tb.version_label,
          tb.unit_label,
          e.employeecode
        FROM work_logs wl
        JOIN efficiency_projects ep ON ep.id = wl.project_id
        JOIN task_baselines tb ON tb.id = wl.task_baseline_id
        JOIN employees e ON e.id = wl.employee_id
        JOIN manageremployees me ON me.employeeid = wl.employee_id AND me.managerid = $1
        WHERE wl.status = 'pending'
        ORDER BY wl.log_date DESC, wl.created_at DESC
      `,
      [managerId]
    );
    return res.json({ workLogs: rows });
  } catch (err) {
    console.error('GET /work-logs/pending:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/work-logs/:id/approve', requireRoles('manager'), async (req, res) => {
  const workLogId = Number(req.params.id);
  if (!Number.isFinite(workLogId)) return res.status(400).json({ message: 'Invalid work log id' });

  try {
    const log = await ensureManagedPendingWorkLog(req.user.id, workLogId);
    const baseline = await pool.query(
      'SELECT manhours_per_unit FROM task_baselines WHERE id = $1',
      [log.task_baseline_id]
    );
    const rate = Number(baseline.rows[0]?.manhours_per_unit);
    if (!Number.isFinite(rate) || rate <= 0) {
      return res.status(400).json({ message: 'Invalid manhours_per_unit on baseline' });
    }
    const impliedMhs = Number(log.actual_output_qty) * rate;

    const { rows } = await pool.query(
      `
        UPDATE work_logs
        SET status = 'approved',
            implied_mhs = $1,
            approved_at = NOW(),
            manager_id = $2
        WHERE id = $3
        RETURNING *
      `,
      [impliedMhs, req.user.id, workLogId]
    );
    return res.json({ workLog: rows[0] });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('PATCH /work-logs/:id/approve:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/work-logs/:id/reject', requireRoles('manager'), async (req, res) => {
  const workLogId = Number(req.params.id);
  if (!Number.isFinite(workLogId)) return res.status(400).json({ message: 'Invalid work log id' });
  const remarks = String(req.body?.managerRemarks ?? req.body?.manager_remarks ?? '').trim() || null;

  try {
    await ensureManagedPendingWorkLog(req.user.id, workLogId);
    const { rows } = await pool.query(
      `
        UPDATE work_logs
        SET status = 'rejected',
            manager_remarks = $1,
            manager_id = $2
        WHERE id = $3
        RETURNING *
      `,
      [remarks, req.user.id, workLogId]
    );
    return res.json({ workLog: rows[0] });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('PATCH /work-logs/:id/reject:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/efficiency/daily-inputs', requireEfficiencyViewer, async (req, res) => {
  try {
    const filters = await efficiencyViewerFilters(req);
    const report = await buildDailyInputsReport({
      ...filters,
      date: req.query.date,
    });
    return res.json(report);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('GET /efficiency/daily-inputs:', err.message);
    if (err.code === '42P01') {
      return res.status(503).json({
        message:
          'Efficiency tables are not ready on the database. Restart the server after deploy or run npm run db:migrate on production.',
      });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/efficiency/wd-overrides', requireEfficiencyViewer, async (req, res) => {
  const employeeId = Number(req.body?.employeeId);
  const periodFrom = String(req.body?.periodFrom ?? req.body?.period_from ?? '').trim();
  const periodTo = String(req.body?.periodTo ?? req.body?.period_to ?? periodFrom).trim();
  const wd = Number(req.body?.wd);

  if (!Number.isFinite(employeeId)) return res.status(400).json({ message: 'employeeId is required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(periodTo)) {
    return res.status(400).json({ message: 'periodFrom and periodTo must be YYYY-MM-DD' });
  }
  if (!Number.isFinite(wd) || wd < 0) {
    return res.status(400).json({ message: 'wd must be a number >= 0' });
  }

  try {
    const role = String(req.user?.role || '').toLowerCase().trim();
    if (role === 'manager') {
      const reporteeIds = await managerReporteeIds(req.user.id);
      if (!reporteeIds.includes(employeeId)) {
        return res.status(403).json({ message: 'You can only edit WDs for your assigned reportees' });
      }
    }

    const { rows } = await pool.query(
      `
        INSERT INTO efficiency_wd_overrides (employee_id, period_from, period_to, wd, updated_by)
        VALUES ($1, $2::date, $3::date, $4, $5)
        ON CONFLICT (employee_id, period_from, period_to)
        DO UPDATE SET wd = EXCLUDED.wd, updated_by = EXCLUDED.updated_by, updated_at = NOW()
        RETURNING *
      `,
      [employeeId, periodFrom, periodTo, wd, req.user.id]
    );
    return res.json({ override: rows[0] });
  } catch (err) {
    console.error('PATCH /efficiency/wd-overrides:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/efficiency/wd-integration', requireAnyAdmin, (_req, res) => {
  return res.json({
    confirmed: isWdIntegrationConfirmed(),
    proposal: WD_INTEGRATION_PROPOSAL,
    envVar: 'Set EFFICIENCY_WD_INTEGRATION=disabled to turn off',
  });
});

router.get('/efficiency', requireEfficiencyViewer, async (req, res) => {
  try {
    const filters = await efficiencyViewerFilters(req);
    const report = await buildEfficiencyReport({
      ...filters,
      period: req.query.period,
      date: req.query.date,
    });
    return res.json(report);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('GET /efficiency:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/efficiency/export', requireEfficiencyViewer, async (req, res) => {
  try {
    const filters = await efficiencyViewerFilters(req);
    const report = await buildEfficiencyReport({
      ...filters,
      period: req.query.period,
      date: req.query.date,
    });

    const employeeWdMap = new Map(report.employees.map((e) => [e.employeeId, e]));

    const rows = report.rows.map((row) => {
      const emp = employeeWdMap.get(row.employee_id) || {};
      return {
        Employee: row.employee_name,
        Project: row.project_name,
        Task: row.task_name,
        Version: row.version_label,
        'Date/Period': report.periodLabel,
        'Output Qty': Number(row.actual_output_qty),
        'Output Hours': Number(row.implied_mhs),
        'Work days (WDs)': emp.wd ?? '',
        'Efficiency%': emp.efficiencyPercent ?? '',
        Rating: emp.rating ?? '',
      };
    });

    if (rows.length === 0) {
      rows.push({
        Employee: '',
        Project: '',
        Task: '',
        Version: '',
        'Date/Period': report.periodLabel,
        'Output Qty': '',
        'Output Hours': '',
        'Work days (WDs)': '',
        'Efficiency%': '',
        Rating: '',
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Efficiency');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const range = resolvePeriodRange(req.query.period, req.query.date);
    const filename = `efficiency-${range.period}-${range.from}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buf);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('GET /efficiency/export:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
