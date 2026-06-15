const express = require('express');
const { pool } = require('../db');
const {
  authMiddleware,
  enforceForcePasswordChange,
  requirePortalAdmin,
} = require('../middleware/auth');
const {
  TASK_KEYS,
  IT_SETUP_ITEMS,
  ensureOnboardingTasks,
  syncProfileTask,
  checkAndCompleteOnboarding,
  mapTaskRow,
  progressFromTasks,
  profileCompletionPercentage,
  defaultItMeta,
} = require('../utils/onboardingHelpers');

const router = express.Router();
router.use(authMiddleware);
router.use(enforceForcePasswordChange);

function canAccessEmployee(req, employeeId) {
  if (employeeId === req.user.id) return true;
  return Boolean(req.user.adminId) || ['admin', 'founder'].includes(String(req.user.role || '').toLowerCase());
}

async function loadOnboardingPayload(employeeId) {
  await ensureOnboardingTasks(employeeId);
  const profilePct = await syncProfileTask(employeeId);

  const empRes = await pool.query(
    `
      SELECT id, name, department, onboarding_completed, createdat
      FROM employees WHERE id = $1
    `,
    [employeeId]
  );
  const emp = empRes.rows[0];
  if (!emp) return null;

  const tasksRes = await pool.query(
    `
      SELECT id, task_key, status, completed_at, meta
      FROM onboarding_tasks
      WHERE employee_id = $1
      ORDER BY id ASC
    `,
    [employeeId]
  );
  const tasks = tasksRes.rows.map(mapTaskRow);

  const peersRes = await pool.query(
    `
      SELECT id, name, designation, department, profilephotourl
      FROM employees
      WHERE department IS NOT NULL
        AND lower(trim(department)) = lower(trim($2))
        AND id != $1
        AND COALESCE(isregistered, TRUE) = TRUE
      ORDER BY name ASC
      LIMIT 12
    `,
    [employeeId, emp.department || '']
  );

  const videoRes = await pool.query(`SELECT video_url FROM posh_config WHERE id = 1`);
  const completed = await checkAndCompleteOnboarding(employeeId);

  return {
    employeeId: emp.id,
    employeeName: emp.name,
    department: emp.department,
    onboardingCompleted: Boolean(emp.onboarding_completed || completed),
    profileCompletionPercentage: profilePct,
    progressPercent: progressFromTasks(tasks),
    tasks,
    itSetupItems: IT_SETUP_ITEMS,
    departmentPeers: peersRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      designation: r.designation,
      department: r.department,
    })),
    poshVideoUrl: videoRes.rows[0]?.video_url || null,
  };
}

/** Admin routes — must be registered before /:employeeId */

/** GET /api/onboarding/admin/summary */
router.get('/admin/summary', requirePortalAdmin, async (req, res) => {
  try {
    const filter = String(req.query.filter || 'all').toLowerCase();
    const { rows } = await pool.query(
      `
        SELECT e.id, e.name, e.email, e.employeecode, e.department, e.createdat,
               COALESCE(e.onboarding_completed, FALSE) AS onboarding_completed,
               (
                 SELECT COUNT(*) FILTER (WHERE ot.status = 'completed')::float
                 / NULLIF(COUNT(*)::float, 0) * 100
                 FROM onboarding_tasks ot WHERE ot.employee_id = e.id
               ) AS progress_percent
        FROM employees e
        WHERE e.role IN ('employee', 'manager')
          AND COALESCE(e.isregistered, TRUE) = TRUE
          AND e.createdat >= NOW() - INTERVAL '30 days'
        ORDER BY e.createdat DESC
      `
    );

    let employees = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      employeecode: r.employeecode,
      department: r.department,
      createdAt: r.createdat,
      onboardingCompleted: r.onboarding_completed,
      progressPercent: Math.round(Number(r.progress_percent) || 0),
    }));

    if (filter === 'completed') {
      employees = employees.filter((e) => e.onboardingCompleted);
    } else if (filter === 'in_progress') {
      employees = employees.filter((e) => !e.onboardingCompleted && e.progressPercent > 0);
    } else if (filter === 'not_started') {
      employees = employees.filter((e) => !e.onboardingCompleted && e.progressPercent === 0);
    }

    return res.json({ employees });
  } catch (err) {
    console.error('GET /onboarding/admin/summary:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** GET /api/onboarding/admin/export.csv */
router.get('/admin/export.csv', requirePortalAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT e.id, e.name, e.email, e.employeecode, e.department, e.createdat,
               COALESCE(e.onboarding_completed, FALSE) AS onboarding_completed,
               (
                 SELECT COUNT(*) FILTER (WHERE ot.status = 'completed')
                 FROM onboarding_tasks ot WHERE ot.employee_id = e.id
               ) AS tasks_done,
               (SELECT COUNT(*) FROM onboarding_tasks ot WHERE ot.employee_id = e.id) AS tasks_total
        FROM employees e
        WHERE e.role IN ('employee', 'manager')
          AND COALESCE(e.isregistered, TRUE) = TRUE
          AND e.createdat >= NOW() - INTERVAL '30 days'
        ORDER BY e.name ASC
      `
    );
    const header = 'Name,Email,Code,Department,Hired,Progress,Completed\n';
    const lines = rows.map((r) => {
      const pct =
        r.tasks_total > 0 ? Math.round((r.tasks_done / r.tasks_total) * 100) : 0;
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return [
        esc(r.name),
        esc(r.email),
        esc(r.employeecode),
        esc(r.department),
        esc(r.createdat ? new Date(r.createdat).toISOString().slice(0, 10) : ''),
        esc(`${pct}%`),
        esc(r.onboarding_completed ? 'Yes' : 'No'),
      ].join(',');
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="onboarding-report.csv"');
    return res.send(header + lines.join('\n'));
  } catch (err) {
    console.error('GET /onboarding/admin/export.csv:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/admin/posh/questions', requirePortalAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM posh_quiz_questions ORDER BY sort_order ASC, id ASC`
    );
    return res.json({ questions: rows });
  } catch (err) {
    console.error('GET /onboarding/admin/posh/questions:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/admin/posh/questions', requirePortalAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      `
        INSERT INTO posh_quiz_questions (
          question, option_a, option_b, option_c, option_d, correct_option, sort_order, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        RETURNING *
      `,
      [
        String(b.question || '').trim(),
        String(b.optionA || '').trim(),
        String(b.optionB || '').trim(),
        String(b.optionC || '').trim(),
        String(b.optionD || '').trim(),
        String(b.correctOption || 'a').toLowerCase(),
        Number(b.sortOrder) || 0,
      ]
    );
    return res.status(201).json({ question: rows[0] });
  } catch (err) {
    console.error('POST /onboarding/admin/posh/questions:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/admin/posh/questions/:id', requirePortalAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const { rows } = await pool.query(
      `
        UPDATE posh_quiz_questions SET
          question = COALESCE($2, question),
          option_a = COALESCE($3, option_a),
          option_b = COALESCE($4, option_b),
          option_c = COALESCE($5, option_c),
          option_d = COALESCE($6, option_d),
          correct_option = COALESCE($7, correct_option),
          sort_order = COALESCE($8, sort_order),
          is_active = COALESCE($9, is_active)
        WHERE id = $1
        RETURNING *
      `,
      [
        id,
        b.question != null ? String(b.question).trim() : null,
        b.optionA != null ? String(b.optionA).trim() : null,
        b.optionB != null ? String(b.optionB).trim() : null,
        b.optionC != null ? String(b.optionC).trim() : null,
        b.optionD != null ? String(b.optionD).trim() : null,
        b.correctOption != null ? String(b.correctOption).toLowerCase() : null,
        b.sortOrder != null ? Number(b.sortOrder) : null,
        b.isActive != null ? Boolean(b.isActive) : null,
      ]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Question not found' });
    return res.json({ question: rows[0] });
  } catch (err) {
    console.error('PUT /onboarding/admin/posh/questions/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/admin/posh/questions/:id', requirePortalAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`DELETE FROM posh_quiz_questions WHERE id = $1`, [id]);
    return res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /onboarding/admin/posh/questions/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/admin/posh/video', requirePortalAdmin, async (req, res) => {
  try {
    const videoUrl = String(req.body?.videoUrl || '').trim();
    if (!videoUrl) return res.status(400).json({ message: 'videoUrl is required' });
    await pool.query(
      `
        INSERT INTO posh_config (id, video_url, updated_at)
        VALUES (1, $1, NOW())
        ON CONFLICT (id) DO UPDATE SET video_url = EXCLUDED.video_url, updated_at = NOW()
      `,
      [videoUrl]
    );
    return res.json({ videoUrl });
  } catch (err) {
    console.error('PUT /onboarding/admin/posh/video:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/admin/:employeeId/detail', requirePortalAdmin, async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    if (!Number.isFinite(employeeId)) {
      return res.status(400).json({ message: 'Invalid employee id' });
    }
    const payload = await loadOnboardingPayload(employeeId);
    if (!payload) return res.status(404).json({ message: 'Employee not found' });
    return res.json(payload);
  } catch (err) {
    console.error('GET /onboarding/admin/:employeeId/detail:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** GET /api/onboarding/:employeeId */
router.get('/:employeeId', async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    if (!Number.isFinite(employeeId)) {
      return res.status(400).json({ message: 'Invalid employee id' });
    }
    if (!canAccessEmployee(req, employeeId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const payload = await loadOnboardingPayload(employeeId);
    if (!payload) return res.status(404).json({ message: 'Employee not found' });
    return res.json(payload);
  } catch (err) {
    console.error('GET /onboarding/:employeeId:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PATCH /api/onboarding/:employeeId/task */
router.patch('/:employeeId/task', async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const taskKey = String(req.body?.taskKey || '').trim();
    const status = String(req.body?.status || 'completed').toLowerCase();
    const meta = req.body?.meta;

    if (!Number.isFinite(employeeId)) {
      return res.status(400).json({ message: 'Invalid employee id' });
    }
    if (!TASK_KEYS.includes(taskKey)) {
      return res.status(400).json({ message: 'Invalid taskKey' });
    }
    if (!canAccessEmployee(req, employeeId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (req.user.id !== employeeId && !req.user.adminId) {
      return res.status(403).json({ message: 'Only the employee can update their tasks' });
    }

    await ensureOnboardingTasks(employeeId);

    if (taskKey === 'profile_complete') {
      const pct = await syncProfileTask(employeeId);
      if (pct < 100) {
        return res.status(400).json({
          message: 'Profile must be 100% complete before marking this task done',
          profileCompletionPercentage: pct,
        });
      }
    }

    if (taskKey === 'it_setup' && meta?.items) {
      const allChecked = IT_SETUP_ITEMS.every((i) => Boolean(meta.items[i.key]));
      if (!allChecked) {
        await pool.query(
          `
            UPDATE onboarding_tasks
            SET meta = $3::jsonb, status = 'pending', completed_at = NULL
            WHERE employee_id = $1 AND task_key = $2
          `,
          [employeeId, taskKey, JSON.stringify({ items: meta.items })]
        );
        const payload = await loadOnboardingPayload(employeeId);
        return res.json(payload);
      }
      await pool.query(
        `
          UPDATE onboarding_tasks
          SET meta = $3::jsonb, status = 'completed', completed_at = NOW()
          WHERE employee_id = $1 AND task_key = $2
        `,
        [employeeId, taskKey, JSON.stringify({ items: meta.items })]
      );
    } else if (status === 'completed') {
      await pool.query(
        `
          UPDATE onboarding_tasks
          SET status = 'completed', completed_at = COALESCE(completed_at, NOW())
          WHERE employee_id = $1 AND task_key = $2
        `,
        [employeeId, taskKey]
      );
    }

    await checkAndCompleteOnboarding(employeeId);
    const payload = await loadOnboardingPayload(employeeId);
    return res.json(payload);
  } catch (err) {
    console.error('PATCH /onboarding/:employeeId/task:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
