const express = require('express');
const XLSX = require('xlsx');
const { pool } = require('../db');
const {
  authMiddleware,
  enforceForcePasswordChange,
  requirePortalAdmin,
  requireRoles,
} = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { ensurePerformanceSchema } = require('../utils/performanceSchema');
const {
  parseYearQuarter,
  validateOkrPayload,
  mapOkrRow,
  isManagerOf,
  getDirectReportIds,
  computeAdminQuarterScore,
  computeAnnualScore,
  getQuarterWeights,
  getRatingBands,
  bandForScore,
  reviewForEmployee,
  reviewForEmployeeManagerVisible,
  reviewForManager,
  reviewForAdmin,
  mapReviewStatusForAdmin,
  ensureReviewRow,
  getOkrs,
  okrsLocked,
  currentYear,
  currentQuarter,
} = require('../utils/performanceHelpers');

const router = express.Router();
router.use(authMiddleware);
router.use(enforceForcePasswordChange);
router.use(async (_req, res, next) => {
  try {
    await ensurePerformanceSchema();
    next();
  } catch (e) {
    console.error('Performance schema ensure failed:', e.message);
    return res.status(500).json({ message: 'Performance module is initializing. Please refresh.' });
  }
});

function handleErr(res, err) {
  if (err.status) return res.status(err.status).json({ message: err.message });
  console.error(err);
  return res.status(500).json({ message: 'Internal server error' });
}

function normalizeOkrRatingEntry(entry) {
  const rating = Number(entry?.rating ?? entry?.score);
  return {
    okrId: Number(entry?.okrId),
    rating: Number.isFinite(rating) ? rating : null,
    progress: entry?.progress != null ? Number(entry.progress) : undefined,
    feedback: entry?.feedback != null ? String(entry.feedback).trim() : undefined,
  };
}

function inRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

async function getCycleMeta(year, quarter) {
  const { rows } = await pool.query(
    `SELECT status, initialized_at, stopped_at FROM performance_cycles WHERE year = $1 AND quarter = $2`,
    [year, quarter]
  );
  if (rows[0]) {
    return {
      initialized: true,
      status: rows[0].status,
      initializedAt: rows[0].initialized_at,
      stoppedAt: rows[0].stopped_at,
    };
  }
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS c FROM performance_reviews WHERE year = $1 AND quarter = $2`,
    [year, quarter]
  );
  if ((countRes.rows[0]?.c || 0) > 0) {
    return { initialized: true, status: 'ACTIVE', initializedAt: null, stoppedAt: null };
  }
  return { initialized: false, status: null, initializedAt: null, stoppedAt: null };
}

function validatePerOkrRatings(ratings, okrs, { requireFeedback = false } = {}) {
  if (!Array.isArray(ratings) || !ratings.length) {
    const err = new Error('Rating for each KRA is required');
    err.status = 400;
    throw err;
  }
  for (const okr of okrs) {
    const entry = ratings.map(normalizeOkrRatingEntry).find((r) => r.okrId === okr.id);
    if (!entry || entry.rating == null || entry.rating < 1 || entry.rating > 5) {
      const err = new Error(`Rate each KRA from 1 to 5 (${okr.objective || okr.kra})`);
      err.status = 400;
      throw err;
    }
    if (requireFeedback && !entry.feedback) {
      const err = new Error(`Written feedback is required for each KRA (${okr.objective || okr.kra})`);
      err.status = 400;
      throw err;
    }
  }
}

async function getActiveCategories() {
  const { rows } = await pool.query(
    `SELECT id, name, active FROM appraisal_categories WHERE active = TRUE ORDER BY id`
  );
  return rows;
}

async function loadEmployeeMeta(employeeId) {
  const { rows } = await pool.query(
    `SELECT id, name, employeecode, department FROM employees WHERE id = $1`,
    [employeeId]
  );
  if (!rows[0]) {
    const err = new Error('Employee not found');
    err.status = 404;
    throw err;
  }
  return {
    id: rows[0].id,
    name: rows[0].name,
    employeecode: rows[0].employeecode,
    department: rows[0].department,
  };
}

/** GET /api/performance/my — employee quarter context */
router.get('/my', requireRoles('employee', 'manager'), async (req, res) => {
  try {
    const { year, quarter } = parseYearQuarter(req.query);
    const employeeId = req.user.id;
    const okrs = await getOkrs(employeeId, year, quarter);
    const reviewRes = await pool.query(
      `SELECT * FROM performance_reviews WHERE employee_id = $1 AND year = $2 AND quarter = $3`,
      [employeeId, year, quarter]
    );
    const annualRes = await pool.query(
      `SELECT year, q1_score, q2_score, q3_score, q4_score, annual_score, rating_band, rating_value, increment_percent, bonus_amount, status
       FROM annual_appraisals WHERE employee_id = $1 AND year = $2`,
      [employeeId, year]
    );
    const categories = await getActiveCategories();
    const annual = annualRes.rows[0];
    return res.json({
      year,
      quarter,
      okrs,
      okrsLocked: okrsLocked(okrs),
      review: reviewForEmployee(reviewRes.rows[0]),
      managerReview: reviewForEmployeeManagerVisible(reviewRes.rows[0]),
      annual: annual
        ? {
            year: annual.year,
            q1Score: annual.q1_score != null ? Number(annual.q1_score) : null,
            q2Score: annual.q2_score != null ? Number(annual.q2_score) : null,
            q3Score: annual.q3_score != null ? Number(annual.q3_score) : null,
            q4Score: annual.q4_score != null ? Number(annual.q4_score) : null,
            annualScore: annual.annual_score != null ? Number(annual.annual_score) : null,
            ratingBand: annual.rating_band,
            ratingValue: annual.rating_value,
            status: annual.status,
          }
        : null,
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
    });
  } catch (err) {
    return handleErr(res, err);
  }
});

/** POST /api/performance/okrs — employee submit OKRs */
router.post('/okrs', requireRoles('employee', 'manager'), async (req, res) => {
  try {
    const { year, quarter } = parseYearQuarter(req.body);
    const employeeId = req.user.id;
    const okrs = req.body?.okrs || [];
    validateOkrPayload(okrs);

    const existing = await getOkrs(employeeId, year, quarter);
    if (okrsLocked(existing)) {
      return res.status(400).json({ message: 'OKRs are locked for this quarter' });
    }

    await pool.query(`DELETE FROM okr_definitions WHERE employee_id = $1 AND year = $2 AND quarter = $3`, [
      employeeId,
      year,
      quarter,
    ]);

    for (const o of okrs) {
      await pool.query(
        `INSERT INTO okr_definitions (employee_id, quarter, year, objective, key_result, kra, kpi, weightage, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SUBMITTED')`,
        [
          employeeId,
          quarter,
          year,
          String(o.objective).trim(),
          String(o.keyResult || o.key_result).trim(),
          String(o.kra).trim(),
          String(o.kpi).trim(),
          Number(o.weightage),
        ]
      );
    }

    const mgrs = await pool.query(`SELECT managerid FROM manageremployees WHERE employeeid = $1`, [employeeId]);
    for (const m of mgrs.rows) {
      await createNotification(
        m.managerid,
        'performance_okr',
        `${req.user.name} submitted Q${quarter} OKRs for your review.`,
        { subjectEmployeeId: employeeId }
      );
    }

    const saved = await getOkrs(employeeId, year, quarter);
    return res.status(201).json({ okrs: saved, message: 'OKRs submitted to manager' });
  } catch (err) {
    return handleErr(res, err);
  }
});

/** POST /api/performance/reviews/self */
router.post('/reviews/self', requireRoles('employee', 'manager'), async (req, res) => {
  try {
    const { year, quarter } = parseYearQuarter(req.body);
    const employeeId = req.user.id;
    const okrs = await getOkrs(employeeId, year, quarter);
    if (!okrsLocked(okrs)) {
      return res.status(400).json({ message: 'OKRs must be locked before self-assessment' });
    }

    const review = await ensureReviewRow(employeeId, year, quarter);
    if (['SELF SUBMITTED', 'MANAGER SUBMITTED', 'LOCKED'].includes(review.status)) {
      return res.status(409).json({ message: 'Self-assessment already submitted' });
    }

    const selfRatingPerOkr = (req.body?.selfRatingPerOkr || req.body?.self_rating_per_okr || []).map(
      normalizeOkrRatingEntry
    );
    const selfCategoryRatings = req.body?.selfCategoryRatings || req.body?.self_category_ratings || {};
    const selfOverallRating = Number(req.body?.selfOverallRating ?? req.body?.self_overall_rating);
    const selfFeedback = String(req.body?.selfFeedback || req.body?.self_feedback || '').trim();

    if (!Number.isFinite(selfOverallRating) || selfOverallRating < 1 || selfOverallRating > 5) {
      return res.status(400).json({ message: 'Overall self-rating must be between 1 and 5' });
    }
    try {
      validatePerOkrRatings(selfRatingPerOkr, okrs, { requireFeedback: true });
    } catch (e) {
      return handleErr(res, e);
    }
    if (!selfFeedback && !selfRatingPerOkr.every((r) => r.feedback)) {
      return res.status(400).json({ message: 'Provide overall summary or feedback on each KRA' });
    }

    for (const entry of selfRatingPerOkr) {
      if (entry.progress != null && Number.isFinite(entry.progress)) {
        await pool.query(
          `UPDATE okr_definitions SET progress_percent = $5, updated_at = NOW()
           WHERE id = $1 AND employee_id = $2 AND year = $3 AND quarter = $4`,
          [entry.okrId, employeeId, year, quarter, Math.min(100, Math.max(0, entry.progress))]
        );
      }
    }

    const { rows } = await pool.query(
      `
        UPDATE performance_reviews SET
          self_rating_per_okr = $4::jsonb,
          self_category_ratings = $5::jsonb,
          self_overall_rating = $6,
          self_feedback = $7,
          status = 'SELF SUBMITTED',
          updated_at = NOW()
        WHERE employee_id = $1 AND year = $2 AND quarter = $3
        RETURNING *
      `,
      [
        employeeId,
        year,
        quarter,
        JSON.stringify(selfRatingPerOkr),
        JSON.stringify(selfCategoryRatings),
        selfOverallRating,
        selfFeedback,
      ]
    );

    const mgrs = await pool.query(`SELECT managerid FROM manageremployees WHERE employeeid = $1`, [employeeId]);
    for (const m of mgrs.rows) {
      await createNotification(
        m.managerid,
        'performance_review',
        `${req.user.name} submitted Q${quarter} self-assessment.`,
        { subjectEmployeeId: employeeId }
      );
    }

    return res.json({ review: reviewForEmployee(rows[0]) });
  } catch (err) {
    return handleErr(res, err);
  }
});

/** GET /api/performance/manager/team */
router.get('/manager/team', requireRoles('manager', 'admin', 'founder'), async (req, res) => {
  try {
    const { year, quarter } = parseYearQuarter(req.query);
    const reportIds = await getDirectReportIds(req.user.id);
    if (!reportIds.length) return res.json({ members: [] });

    const { rows } = await pool.query(
      `
        SELECT e.id, e.name, e.employeecode, e.department,
          (SELECT COUNT(*)::int FROM okr_definitions o WHERE o.employee_id = e.id AND o.year = $2 AND o.quarter = $3) AS okr_count,
          (SELECT BOOL_AND(o.status = 'LOCKED') FROM okr_definitions o WHERE o.employee_id = e.id AND o.year = $2 AND o.quarter = $3) AS okrs_locked,
          pr.status AS review_status
        FROM employees e
        LEFT JOIN performance_reviews pr ON pr.employee_id = e.id AND pr.year = $2 AND pr.quarter = $3
        WHERE e.id = ANY($1::int[])
        ORDER BY e.name
      `,
      [reportIds, year, quarter]
    );

    return res.json({
      year,
      quarter,
      members: rows.map((r) => ({
        id: r.id,
        name: r.name,
        employeecode: r.employeecode,
        department: r.department,
        okrCount: r.okr_count || 0,
        okrsLocked: Boolean(r.okrs_locked),
        reviewStatus: r.review_status || 'PENDING',
      })),
    });
  } catch (err) {
    return handleErr(res, err);
  }
});

/** GET /api/performance/manager/employee/:employeeId */
router.get('/manager/employee/:employeeId', requireRoles('manager', 'admin', 'founder'), async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const { year, quarter } = parseYearQuarter(req.query);
    if (!(await isManagerOf(req.user.id, employeeId)) && !req.user.adminId) {
      const role = String(req.user.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'founder') {
        return res.status(403).json({ message: 'Not your direct report' });
      }
    }

    const okrs = await getOkrs(employeeId, year, quarter);
    const reviewRes = await pool.query(
      `SELECT * FROM performance_reviews WHERE employee_id = $1 AND year = $2 AND quarter = $3`,
      [employeeId, year, quarter]
    );
    const employee = await loadEmployeeMeta(employeeId);
    const role = String(req.user.role || '').toLowerCase();
    const isAdminSession = Boolean(req.user.adminId) || role === 'admin' || role === 'founder';

    return res.json({
      employee,
      year,
      quarter,
      okrs,
      okrsLocked: okrsLocked(okrs),
      review: isAdminSession
        ? reviewForAdmin(reviewRes.rows[0])
        : reviewForManager(reviewRes.rows[0]),
      categories: (await getActiveCategories()).map((c) => ({ id: c.id, name: c.name })),
    });
  } catch (err) {
    return handleErr(res, err);
  }
});

/** PUT /api/performance/manager/okrs/:employeeId — manager edit OKRs before lock */
router.put('/manager/okrs/:employeeId', requireRoles('manager', 'admin', 'founder'), async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const { year, quarter } = parseYearQuarter(req.body);
    if (!(await isManagerOf(req.user.id, employeeId))) {
      return res.status(403).json({ message: 'Not your direct report' });
    }

    const existing = await getOkrs(employeeId, year, quarter);
    if (okrsLocked(existing)) {
      return res.status(400).json({ message: 'OKRs already locked' });
    }

    const okrs = req.body?.okrs || [];
    validateOkrPayload(okrs);
    const managerNotes = req.body?.managerNotes != null ? String(req.body.managerNotes).trim() : null;

    await pool.query(`DELETE FROM okr_definitions WHERE employee_id = $1 AND year = $2 AND quarter = $3`, [
      employeeId,
      year,
      quarter,
    ]);

    for (const o of okrs) {
      await pool.query(
        `INSERT INTO okr_definitions (employee_id, quarter, year, objective, key_result, kra, kpi, weightage, status, manager_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'APPROVED', $9)`,
        [
          employeeId,
          quarter,
          year,
          String(o.objective).trim(),
          String(o.keyResult || o.key_result).trim(),
          String(o.kra).trim(),
          String(o.kpi).trim(),
          Number(o.weightage),
          managerNotes,
        ]
      );
    }

    return res.json({ okrs: await getOkrs(employeeId, year, quarter) });
  } catch (err) {
    return handleErr(res, err);
  }
});

/** POST /api/performance/manager/okrs/:employeeId/lock */
router.post('/manager/okrs/:employeeId/lock', requireRoles('manager', 'admin', 'founder'), async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const { year, quarter } = parseYearQuarter(req.body);
    if (!(await isManagerOf(req.user.id, employeeId))) {
      return res.status(403).json({ message: 'Not your direct report' });
    }

    const okrs = await getOkrs(employeeId, year, quarter);
    if (!okrs.length) return res.status(400).json({ message: 'No OKRs to lock' });
    if (okrsLocked(okrs)) return res.status(400).json({ message: 'Already locked' });

    await pool.query(
      `UPDATE okr_definitions SET status = 'LOCKED', updated_at = NOW()
       WHERE employee_id = $1 AND year = $2 AND quarter = $3`,
      [employeeId, year, quarter]
    );

    await createNotification(
      employeeId,
      'performance_okr',
      `Your Q${quarter} OKRs have been approved and locked.`,
      { subjectEmployeeId: employeeId }
    );

    return res.json({ okrs: await getOkrs(employeeId, year, quarter) });
  } catch (err) {
    return handleErr(res, err);
  }
});

/** POST /api/performance/manager/reviews/:employeeId */
router.post('/manager/reviews/:employeeId', requireRoles('manager', 'admin', 'founder'), async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const { year, quarter } = parseYearQuarter(req.body);
    if (!(await isManagerOf(req.user.id, employeeId))) {
      return res.status(403).json({ message: 'Not your direct report' });
    }

    const review = await ensureReviewRow(employeeId, year, quarter);
    if (review.status !== 'SELF SUBMITTED') {
      return res.status(400).json({ message: 'Employee must submit self-assessment first' });
    }

    const managerRatingPerOkr = (req.body?.managerRatingPerOkr || req.body?.manager_rating_per_okr || []).map(
      normalizeOkrRatingEntry
    );
    const managerFeedbackPerOkr = (req.body?.managerFeedbackPerOkr || req.body?.manager_feedback_per_okr || []).map(
      normalizeOkrRatingEntry
    );
    const managerOverallRating = Number(req.body?.managerOverallRating ?? req.body?.manager_overall_rating);
    const managerFeedback = String(req.body?.managerFeedback || req.body?.manager_feedback || '').trim();

    if (!Number.isFinite(managerOverallRating) || managerOverallRating < 1 || managerOverallRating > 5) {
      return res.status(400).json({ message: 'Manager overall rating must be between 1 and 5' });
    }

    const okrs = await getOkrs(employeeId, year, quarter);
    try {
      validatePerOkrRatings(managerRatingPerOkr, okrs, { requireFeedback: false });
    } catch (e) {
      return handleErr(res, e);
    }
    if (!managerFeedback && !managerFeedbackPerOkr.some((f) => f.feedback)) {
      return res.status(400).json({ message: 'Manager feedback summary or per-KRA feedback is required' });
    }

    const mergedFeedbackPerOkr = managerRatingPerOkr.map((r) => {
      const extra = managerFeedbackPerOkr.find((f) => f.okrId === r.okrId);
      return { ...r, feedback: r.feedback || extra?.feedback || null };
    });

    const { rows } = await pool.query(
      `
        UPDATE performance_reviews SET
          manager_rating_per_okr = $4::jsonb,
          manager_feedback_per_okr = $5::jsonb,
          manager_overall_rating = $6,
          manager_feedback = $7,
          status = 'MANAGER SUBMITTED',
          updated_at = NOW()
        WHERE employee_id = $1 AND year = $2 AND quarter = $3
        RETURNING *
      `,
      [
        employeeId,
        year,
        quarter,
        JSON.stringify(managerRatingPerOkr),
        JSON.stringify(mergedFeedbackPerOkr),
        managerOverallRating,
        managerFeedback || null,
      ]
    );

    return res.json({ review: reviewForManager(rows[0]) });
  } catch (err) {
    return handleErr(res, err);
  }
});

// ─── Admin routes ───

/** GET /api/performance/history — quarterly & annual history for current user */
router.get('/history', requireRoles('employee', 'manager'), async (req, res) => {
  try {
    const employeeId = req.user.id;
    const { rows: reviews } = await pool.query(
      `
        SELECT pr.*,
          (SELECT COUNT(*)::int FROM okr_definitions o
           WHERE o.employee_id = pr.employee_id AND o.year = pr.year AND o.quarter = pr.quarter) AS okr_count
        FROM performance_reviews pr
        WHERE pr.employee_id = $1
        ORDER BY pr.year DESC, pr.quarter DESC
      `,
      [employeeId]
    );
    const { rows: annuals } = await pool.query(
      `SELECT * FROM annual_appraisals WHERE employee_id = $1 ORDER BY year DESC`,
      [employeeId]
    );
    return res.json({
      quarters: reviews.map((r) => ({
        year: r.year,
        quarter: r.quarter,
        status: r.status,
        okrCount: r.okr_count || 0,
        selfOverallRating: r.self_overall_rating != null ? Number(r.self_overall_rating) : null,
        managerOverallRating: r.manager_overall_rating != null ? Number(r.manager_overall_rating) : null,
        finalScore:
          r.status === 'LOCKED' && r.admin_final_quarter_score != null
            ? Number(r.admin_final_quarter_score)
            : null,
        lockedAt: r.locked_at || null,
      })),
      annuals: annuals.map((a) => ({
        year: a.year,
        q1Score: a.q1_score != null ? Number(a.q1_score) : null,
        q2Score: a.q2_score != null ? Number(a.q2_score) : null,
        q3Score: a.q3_score != null ? Number(a.q3_score) : null,
        q4Score: a.q4_score != null ? Number(a.q4_score) : null,
        annualScore: a.annual_score != null ? Number(a.annual_score) : null,
        ratingBand: a.rating_band,
        ratingValue: a.rating_value,
        status: a.status,
      })),
    });
  } catch (err) {
    return handleErr(res, err);
  }
});

/** GET /api/performance/manager/team-analysis */
router.get('/manager/team-analysis', requireRoles('manager', 'admin', 'founder'), async (req, res) => {
  try {
    const { year, quarter } = parseYearQuarter(req.query);
    const reportIds = await getDirectReportIds(req.user.id);
    if (!reportIds.length) {
      return res.json({ year, quarter, members: [], quarterlyTrend: [], summary: { total: 0, completed: 0, avgManagerRating: null } });
    }

    const { rows } = await pool.query(
      `
        SELECT e.id, e.name, e.department,
          (SELECT COUNT(*)::int FROM okr_definitions o WHERE o.employee_id = e.id AND o.year = $2 AND o.quarter = $3) AS okr_count,
          (SELECT BOOL_AND(o.status = 'LOCKED') FROM okr_definitions o WHERE o.employee_id = e.id AND o.year = $2 AND o.quarter = $3) AS okrs_locked,
          pr.status AS review_status,
          pr.self_overall_rating,
          pr.manager_overall_rating,
          pr.admin_final_quarter_score
        FROM employees e
        LEFT JOIN performance_reviews pr ON pr.employee_id = e.id AND pr.year = $2 AND pr.quarter = $3
        WHERE e.id = ANY($1::int[])
        ORDER BY e.name
      `,
      [reportIds, year, quarter]
    );

    const members = rows.map((r) => ({
      id: r.id,
      name: r.name,
      department: r.department,
      okrCount: r.okr_count || 0,
      okrsLocked: Boolean(r.okrs_locked),
      reviewStatus: r.review_status || 'PENDING',
      selfOverallRating: r.self_overall_rating != null ? Number(r.self_overall_rating) : null,
      managerOverallRating: r.manager_overall_rating != null ? Number(r.manager_overall_rating) : null,
      finalScore: r.admin_final_quarter_score != null ? Number(r.admin_final_quarter_score) : null,
    }));

    const completed = members.filter((m) => m.reviewStatus === 'LOCKED').length;
    const mgrRatings = members.map((m) => m.managerOverallRating).filter((v) => v != null);
    const avgManagerRating = mgrRatings.length
      ? Math.round((mgrRatings.reduce((a, b) => a + b, 0) / mgrRatings.length) * 100) / 100
      : null;

    const { rows: trendRows } = await pool.query(
      `
        SELECT pr.year, pr.quarter,
          ROUND(AVG(pr.self_overall_rating)::numeric, 2) AS avg_self_rating,
          ROUND(AVG(pr.manager_overall_rating)::numeric, 2) AS avg_manager_rating,
          ROUND(AVG(CASE WHEN pr.status = 'LOCKED' THEN pr.admin_final_quarter_score END)::numeric, 2) AS avg_final_score,
          COUNT(*) FILTER (WHERE pr.status = 'LOCKED')::int AS completed_count
        FROM performance_reviews pr
        WHERE pr.employee_id = ANY($1::int[])
        GROUP BY pr.year, pr.quarter
        ORDER BY pr.year, pr.quarter
      `,
      [reportIds]
    );

    return res.json({
      year,
      quarter,
      members,
      quarterlyTrend: trendRows.map((r) => ({
        year: r.year,
        quarter: r.quarter,
        avgSelfRating: r.avg_self_rating != null ? Number(r.avg_self_rating) : null,
        avgManagerRating: r.avg_manager_rating != null ? Number(r.avg_manager_rating) : null,
        avgFinalScore: r.avg_final_score != null ? Number(r.avg_final_score) : null,
        completedCount: r.completed_count || 0,
      })),
      summary: {
        total: members.length,
        okrsPending: members.filter((m) => m.okrCount > 0 && !m.okrsLocked).length,
        selfPending: members.filter((m) => m.okrsLocked && (!m.reviewStatus || m.reviewStatus === 'PENDING')).length,
        managerPending: members.filter((m) => m.reviewStatus === 'SELF SUBMITTED').length,
        completed,
        avgManagerRating,
      },
    });
  } catch (err) {
    return handleErr(res, err);
  }
});

/** GET /api/performance/admin/overview — cycle dashboard */
router.get('/admin/overview', requirePortalAdmin, async (req, res) => {
  try {
    const { year, quarter } = parseYearQuarter(req.query);
    const { rows } = await pool.query(
      `
        SELECT e.id AS employee_id, e.name, e.department, e.designation,
          (SELECT m.name FROM manageremployees me
           JOIN employees m ON m.id = me.managerid
           WHERE me.employeeid = e.id LIMIT 1) AS manager_name,
          (SELECT COUNT(*)::int FROM okr_definitions o
           WHERE o.employee_id = e.id AND o.year = $1 AND o.quarter = $2) AS okr_count,
          (SELECT BOOL_AND(o.status = 'LOCKED') FROM okr_definitions o
           WHERE o.employee_id = e.id AND o.year = $1 AND o.quarter = $2) AS okrs_locked,
          pr.status AS review_status,
          pr.manager_overall_rating,
          pr.admin_final_quarter_score
        FROM employees e
        LEFT JOIN performance_reviews pr ON pr.employee_id = e.id AND pr.year = $1 AND pr.quarter = $2
        WHERE COALESCE(e.is_active, TRUE) = TRUE AND COALESCE(e.isregistered, TRUE) = TRUE
        ORDER BY e.name
      `,
      [year, quarter]
    );

    const employees = rows.map((r) => {
      const uiStatus = mapReviewStatusForAdmin(
        r.review_status,
        r.okr_count || 0,
        Boolean(r.okrs_locked)
      );
      let finalRating = null;
      let finalRatingLabel = null;
      if (r.review_status === 'LOCKED' && r.admin_final_quarter_score != null) {
        finalRating = Number(r.admin_final_quarter_score);
        finalRatingLabel = `${finalRating}/100`;
      } else if (r.manager_overall_rating != null) {
        finalRating = Number(r.manager_overall_rating);
        finalRatingLabel = `${finalRating}/5`;
      }
      return {
        employeeId: r.employee_id,
        name: r.name,
        designation: r.designation || '',
        department: r.department || '',
        managerName: r.manager_name || '—',
        okrCount: r.okr_count || 0,
        uiStatus,
        reviewStatus: r.review_status || 'PENDING',
        finalRating,
        finalRatingLabel,
      };
    });

    const total = employees.length;
    const statusCounts = {
      not_started: 0,
      self_review: 0,
      manager_review: 0,
      completed: 0,
    };
    for (const e of employees) statusCounts[e.uiStatus] = (statusCounts[e.uiStatus] || 0) + 1;

    const completed = statusCounts.completed || 0;
    const awaitingManagers = employees.filter((e) => e.reviewStatus === 'SELF SUBMITTED').length;
    const notStarted = employees.filter((e) => e.okrCount === 0).length;

    const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const e of employees) {
      if (e.reviewStatus === 'LOCKED' && e.finalRating != null) {
        const band = Math.min(5, Math.max(1, Math.round(e.finalRating)));
        ratingDist[band] = (ratingDist[band] || 0) + 1;
      }
    }

    const cycle = await getCycleMeta(year, quarter);

    return res.json({
      year,
      quarter,
      cycle,
      cycleLabel: `Q${quarter} ${year} Performance Cycle`,
      completionPercent: total ? Math.round((completed / total) * 100) : 0,
      totalReviews: total,
      awaitingManagers,
      notStarted,
      statusBreakdown: [
        { key: 'not_started', label: 'Not started', count: statusCounts.not_started, percent: total ? Math.round((statusCounts.not_started / total) * 100) : 0 },
        { key: 'self_review', label: 'Self review pending', count: statusCounts.self_review, percent: total ? Math.round((statusCounts.self_review / total) * 100) : 0 },
        { key: 'manager_review', label: 'Awaiting manager', count: statusCounts.manager_review, percent: total ? Math.round((statusCounts.manager_review / total) * 100) : 0 },
        { key: 'completed', label: 'Completed', count: statusCounts.completed, percent: total ? Math.round((statusCounts.completed / total) * 100) : 0 },
      ],
      ratingDistribution: ratingDist,
      employees,
    });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.post('/admin/cycles/start', requirePortalAdmin, async (req, res) => {
  try {
    const { year, quarter } = parseYearQuarter(req.body);
    const existing = await getCycleMeta(year, quarter);
    if (existing.initialized) {
      return res.status(409).json({ message: `Q${quarter} ${year} cycle is already initialized` });
    }

    const { rows } = await pool.query(
      `SELECT id FROM employees WHERE COALESCE(is_active, TRUE) = TRUE AND COALESCE(isregistered, TRUE) = TRUE`
    );
    for (const e of rows) {
      await ensureReviewRow(e.id, year, quarter);
    }
    await pool.query(
      `
        INSERT INTO performance_cycles (year, quarter, status, initialized_by)
        VALUES ($1, $2, 'ACTIVE', $3)
        ON CONFLICT (year, quarter) DO UPDATE SET
          status = 'ACTIVE',
          stopped_at = NULL,
          initialized_at = NOW(),
          initialized_by = EXCLUDED.initialized_by
      `,
      [year, quarter, req.user.id]
    );
    return res.json({
      message: `Q${quarter} ${year} cycle initialized for ${rows.length} employees`,
      year,
      quarter,
      cycle: { initialized: true, status: 'ACTIVE' },
    });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.post('/admin/cycles/stop', requirePortalAdmin, async (req, res) => {
  try {
    const { year, quarter } = parseYearQuarter(req.body);
    const existing = await getCycleMeta(year, quarter);
    if (!existing.initialized) {
      return res.status(400).json({ message: 'Cycle is not initialized for this quarter' });
    }
    if (existing.status === 'STOPPED') {
      return res.status(400).json({ message: 'Cycle is already stopped' });
    }
    await pool.query(
      `
        INSERT INTO performance_cycles (year, quarter, status, initialized_by, stopped_at)
        VALUES ($1, $2, 'STOPPED', $3, NOW())
        ON CONFLICT (year, quarter) DO UPDATE SET
          status = 'STOPPED',
          stopped_at = NOW()
      `,
      [year, quarter, req.user.id]
    );
    return res.json({
      message: `Q${quarter} ${year} cycle stopped`,
      cycle: { initialized: true, status: 'STOPPED' },
    });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.delete('/admin/cycles', requirePortalAdmin, async (req, res) => {
  try {
    const { year, quarter } = parseYearQuarter(req.query);
    const existing = await getCycleMeta(year, quarter);
    if (!existing.initialized) {
      return res.status(400).json({ message: 'No cycle to delete for this quarter' });
    }

    const lockedRes = await pool.query(
      `SELECT COUNT(*)::int AS c FROM performance_reviews WHERE year = $1 AND quarter = $2 AND status = 'LOCKED'`,
      [year, quarter]
    );
    if ((lockedRes.rows[0]?.c || 0) > 0) {
      return res.status(400).json({
        message: 'Cannot delete a cycle with locked reviews. Unlock reviews first.',
      });
    }

    await pool.query(`DELETE FROM okr_definitions WHERE year = $1 AND quarter = $2`, [year, quarter]);
    await pool.query(`DELETE FROM performance_reviews WHERE year = $1 AND quarter = $2`, [year, quarter]);
    await pool.query(`DELETE FROM performance_cycles WHERE year = $1 AND quarter = $2`, [year, quarter]);

    return res.json({ message: `Q${quarter} ${year} cycle deleted` });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.get('/admin/config', requirePortalAdmin, async (_req, res) => {
  try {
    const [bands, categories, weights] = await Promise.all([
      getRatingBands(),
      pool.query(`SELECT * FROM appraisal_categories ORDER BY id`),
      pool.query(`SELECT * FROM performance_quarter_weights ORDER BY year DESC LIMIT 5`),
    ]);
    return res.json({
      bands: bands.map((b) => ({
        id: b.id,
        bandLabel: b.band_label,
        minScore: Number(b.min_score),
        maxScore: Number(b.max_score),
        ratingValue: b.rating_value,
        incrementPercent: Number(b.increment_percent),
        bonusPercent: Number(b.bonus_percent),
      })),
      categories: categories.rows.map((c) => ({ id: c.id, name: c.name, active: c.active })),
      quarterWeights: weights.rows,
    });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.put('/admin/config/bands', requirePortalAdmin, async (req, res) => {
  try {
    const bands = req.body?.bands;
    if (!Array.isArray(bands) || !bands.length) {
      return res.status(400).json({ message: 'bands array required' });
    }
    await pool.query(`DELETE FROM rating_band_config`);
    for (const b of bands) {
      const minScore = Number(b.minScore ?? b.min_score);
      const maxScore = Number(b.maxScore ?? b.max_score);
      const ratingValue = Number(b.ratingValue ?? b.rating_value);
      const incrementPercent = Number(b.incrementPercent ?? b.increment_percent ?? 0);
      const bonusPercent = Number(b.bonusPercent ?? b.bonus_percent ?? 0);
      if (!String(b.bandLabel || b.band_label || '').trim()) {
        return res.status(400).json({ message: 'Band label is required' });
      }
      if (!inRange(minScore, 0, 100) || !inRange(maxScore, 0, 100) || minScore > maxScore) {
        return res.status(400).json({ message: 'Min/Max score must be within 0 to 100, and Min cannot exceed Max' });
      }
      if (!inRange(ratingValue, 0, 5)) {
        return res.status(400).json({ message: 'Rating value must be between 0 and 5' });
      }
      if (!inRange(incrementPercent, 0, 100) || !inRange(bonusPercent, 0, 100)) {
        return res.status(400).json({ message: 'Increment % and Bonus % must be between 0 and 100' });
      }
      await pool.query(
        `INSERT INTO rating_band_config (band_label, min_score, max_score, rating_value, increment_percent, bonus_percent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          String(b.bandLabel || b.band_label).trim(),
          minScore,
          maxScore,
          ratingValue,
          incrementPercent,
          bonusPercent,
        ]
      );
    }
    return res.json({ message: 'Rating bands saved' });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.post('/admin/config/categories', requirePortalAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'name required' });
    const { rows } = await pool.query(
      `INSERT INTO appraisal_categories (name, active) VALUES ($1, TRUE) RETURNING *`,
      [name]
    );
    return res.status(201).json({ category: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Category already exists' });
    return handleErr(res, err);
  }
});

router.put('/admin/config/categories/:id', requirePortalAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const active = req.body?.active !== false;
    const name = req.body?.name != null ? String(req.body.name).trim() : null;
    if (name) {
      await pool.query(`UPDATE appraisal_categories SET name = $2, active = $3 WHERE id = $1`, [id, name, active]);
    } else {
      await pool.query(`UPDATE appraisal_categories SET active = $2 WHERE id = $1`, [id, active]);
    }
    return res.json({ message: 'Updated' });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.delete('/admin/config/categories/:id', requirePortalAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `UPDATE appraisal_categories SET active = FALSE WHERE id = $1 RETURNING id, name`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Category not found' });
    return res.json({ message: 'Category removed', category: { id: rows[0].id, name: rows[0].name } });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.put('/admin/config/quarter-weights', requirePortalAdmin, async (req, res) => {
  try {
    const year = Number(req.body?.year) || currentYear();
    const q1 = Number(req.body?.q1 ?? 25);
    const q2 = Number(req.body?.q2 ?? 25);
    const q3 = Number(req.body?.q3 ?? 25);
    const q4 = Number(req.body?.q4 ?? 25);
    if (Math.abs(q1 + q2 + q3 + q4 - 100) > 0.01) {
      return res.status(400).json({ message: 'Quarter weights must total 100' });
    }
    await pool.query(
      `
        INSERT INTO performance_quarter_weights (year, q1_weight, q2_weight, q3_weight, q4_weight, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (year) DO UPDATE SET
          q1_weight = EXCLUDED.q1_weight,
          q2_weight = EXCLUDED.q2_weight,
          q3_weight = EXCLUDED.q3_weight,
          q4_weight = EXCLUDED.q4_weight,
          updated_at = NOW()
      `,
      [year, q1, q2, q3, q4]
    );
    return res.json({ message: 'Quarter weights saved' });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.get('/admin/reviews', requirePortalAdmin, async (req, res) => {
  try {
    const { year, quarter } = parseYearQuarter(req.query);
    const { rows } = await pool.query(
      `
        SELECT e.id AS employee_id, e.name, e.employeecode, e.department,
          pr.status AS review_status,
          pr.admin_final_quarter_score,
          pr.self_overall_rating,
          pr.manager_overall_rating,
          (SELECT COUNT(*)::int FROM okr_definitions o
           WHERE o.employee_id = e.id AND o.year = $1 AND o.quarter = $2) AS okr_count
        FROM employees e
        LEFT JOIN performance_reviews pr ON pr.employee_id = e.id AND pr.year = $1 AND pr.quarter = $2
        WHERE COALESCE(e.is_active, TRUE) = TRUE AND COALESCE(e.isregistered, TRUE) = TRUE
        ORDER BY e.name
      `,
      [year, quarter]
    );
    return res.json({
      year,
      quarter,
      reviews: rows.map((r) => ({
        employeeId: r.employee_id,
        name: r.name,
        employeecode: r.employeecode,
        department: r.department,
        okrCount: r.okr_count || 0,
        review: {
          status: r.review_status || 'PENDING',
          adminFinalQuarterScore:
            r.admin_final_quarter_score != null ? Number(r.admin_final_quarter_score) : null,
          selfOverallRating: r.self_overall_rating != null ? Number(r.self_overall_rating) : null,
          managerOverallRating:
            r.manager_overall_rating != null ? Number(r.manager_overall_rating) : null,
        },
      })),
    });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.get('/admin/employee/:employeeId', requirePortalAdmin, async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const { year, quarter } = parseYearQuarter(req.query);
    const employee = await loadEmployeeMeta(employeeId);
    const okrs = await getOkrs(employeeId, year, quarter);
    const reviewRes = await pool.query(
      `SELECT * FROM performance_reviews WHERE employee_id = $1 AND year = $2 AND quarter = $3`,
      [employeeId, year, quarter]
    );
    return res.json({
      employee,
      year,
      quarter,
      okrs,
      okrsLocked: okrsLocked(okrs),
      review: reviewForAdmin(reviewRes.rows[0]),
    });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.post('/admin/reviews/:employeeId/finalize', requirePortalAdmin, async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const { year, quarter } = parseYearQuarter(req.body);

    const reviewRes = await pool.query(
      `SELECT * FROM performance_reviews WHERE employee_id = $1 AND year = $2 AND quarter = $3`,
      [employeeId, year, quarter]
    );
    const review = reviewRes.rows[0];
    if (!review || review.status !== 'MANAGER SUBMITTED') {
      return res.status(400).json({ message: 'Manager review must be submitted first' });
    }

    const okrRows = await pool.query(
      `SELECT id, weightage FROM okr_definitions WHERE employee_id = $1 AND year = $2 AND quarter = $3`,
      [employeeId, year, quarter]
    );
    if (!okrRows.rows.length) {
      return res.status(400).json({ message: 'Employee has no OKRs for this quarter' });
    }
    const adminRatingPerOkr = req.body?.adminRatingPerOkr || req.body?.admin_rating_per_okr || [];
    const quarterScore = computeAdminQuarterScore(adminRatingPerOkr, okrRows.rows);

    const { rows } = await pool.query(
      `
        UPDATE performance_reviews SET
          admin_rating_per_okr = $4::jsonb,
          admin_final_quarter_score = $5,
          status = 'LOCKED',
          locked_at = NOW(),
          updated_at = NOW()
        WHERE employee_id = $1 AND year = $2 AND quarter = $3
        RETURNING *
      `,
      [employeeId, year, quarter, JSON.stringify(adminRatingPerOkr), quarterScore]
    );

    await pool.query(
      `
        INSERT INTO annual_appraisals (employee_id, year, q1_score, q2_score, q3_score, q4_score, status)
        VALUES ($1, $2, NULL, NULL, NULL, NULL, 'DRAFT')
        ON CONFLICT (employee_id, year) DO NOTHING
      `,
      [employeeId, year]
    );
    const col = `q${quarter}_score`;
    await pool.query(
      `UPDATE annual_appraisals SET ${col} = $3, updated_at = NOW() WHERE employee_id = $1 AND year = $2`,
      [employeeId, year, quarterScore]
    );

    await createNotification(
      employeeId,
      'performance_rating',
      `Your Q${quarter} performance score is available.`,
      { subjectEmployeeId: employeeId }
    );

    return res.json({ review: reviewForAdmin(rows[0]), quarterScore });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.post('/admin/reviews/:employeeId/unlock', requirePortalAdmin, async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const { year, quarter } = parseYearQuarter(req.body);
    const targetStatus = String(req.body?.status || 'MANAGER SUBMITTED');

    await ensureReviewRow(employeeId, year, quarter);
    const result = await pool.query(
      `
        UPDATE performance_reviews SET
          status = $4,
          unlocked_by = $5,
          unlocked_at = NOW(),
          locked_at = NULL,
          updated_at = NOW()
        WHERE employee_id = $1 AND year = $2 AND quarter = $3
      `,
      [employeeId, year, quarter, targetStatus, req.user.id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Review not found for this quarter' });
    }

    return res.json({ message: 'Quarter review unlocked' });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.post('/admin/annual/:year/compute', requirePortalAdmin, async (req, res) => {
  try {
    const year = Number(req.params.year);
    const weights = await getQuarterWeights(year);
    const { rows: employees } = await pool.query(
      `SELECT id FROM employees WHERE COALESCE(is_active, TRUE) = TRUE AND COALESCE(isregistered, TRUE) = TRUE`
    );

    let computed = 0;
    for (const emp of employees.rows) {
      const locked = await pool.query(
        `SELECT quarter, admin_final_quarter_score FROM performance_reviews
         WHERE employee_id = $1 AND year = $2 AND status = 'LOCKED'`,
        [emp.id, year]
      );
      if (locked.rows.length < 4) continue;

      const scores = { q1: null, q2: null, q3: null, q4: null };
      for (const r of locked.rows) {
        scores[`q${r.quarter}`] = Number(r.admin_final_quarter_score);
      }
      const annualScore = computeAnnualScore(scores, weights);
      if (annualScore == null) continue;

      const band = await bandForScore(annualScore);
      const basicRes = await pool.query(
        `SELECT annual_ctc FROM salary_structures WHERE employee_id = $1 ORDER BY effective_from DESC LIMIT 1`,
        [emp.id]
      );
      const annualCtc = Number(basicRes.rows[0]?.annual_ctc || 0);
      const bonusAmount = band ? Math.round((annualCtc * Number(band.bonus_percent)) / 100) : 0;

      await pool.query(
        `
          INSERT INTO annual_appraisals (employee_id, year, q1_score, q2_score, q3_score, q4_score, annual_score, rating_band, rating_value, increment_percent, bonus_amount, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'DRAFT')
          ON CONFLICT (employee_id, year) DO UPDATE SET
            q1_score = EXCLUDED.q1_score,
            q2_score = EXCLUDED.q2_score,
            q3_score = EXCLUDED.q3_score,
            q4_score = EXCLUDED.q4_score,
            annual_score = EXCLUDED.annual_score,
            rating_band = EXCLUDED.rating_band,
            rating_value = EXCLUDED.rating_value,
            increment_percent = EXCLUDED.increment_percent,
            bonus_amount = EXCLUDED.bonus_amount,
            updated_at = NOW()
        `,
        [
          emp.id,
          year,
          scores.q1,
          scores.q2,
          scores.q3,
          scores.q4,
          annualScore,
          band?.band_label || null,
          band?.rating_value || null,
          band ? Number(band.increment_percent) : 0,
          bonusAmount,
        ]
      );
      computed += 1;
    }

    return res.json({ message: `Computed annual ratings for ${computed} employees` });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.post('/admin/annual/:year/finalize', requirePortalAdmin, async (_req, res) => {
  try {
    const year = Number(_req.params.year);
    await pool.query(
      `UPDATE annual_appraisals SET status = 'FINALISED', finalised_at = NOW(), updated_at = NOW() WHERE year = $1`,
      [year]
    );
    return res.json({ message: 'Annual appraisals finalised' });
  } catch (err) {
    return handleErr(res, err);
  }
});

router.get('/admin/export/:year', requirePortalAdmin, async (req, res) => {
  try {
    const year = Number(req.params.year);
    const { rows } = await pool.query(
      `
        SELECT e.employeecode, e.name, a.q1_score, a.q2_score, a.q3_score, a.q4_score,
               a.annual_score, a.rating_band, a.increment_percent, a.bonus_amount
        FROM annual_appraisals a
        JOIN employees e ON e.id = a.employee_id
        WHERE a.year = $1
        ORDER BY e.name
      `,
      [year]
    );

    const data = rows.map((r) => ({
      'Employee ID': r.employeecode || '',
      'Employee Name': r.name,
      'Q1 Score': r.q1_score,
      'Q2 Score': r.q2_score,
      'Q3 Score': r.q3_score,
      'Q4 Score': r.q4_score,
      'Annual Score': r.annual_score,
      'Rating Band': r.rating_band,
      'Increment %': r.increment_percent,
      'Bonus Amount': r.bonus_amount,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Performance');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="performance-${year}.xlsx"`);
    return res.send(buf);
  } catch (err) {
    return handleErr(res, err);
  }
});

router.post('/admin/overrides', requirePortalAdmin, async (req, res) => {
  try {
    const employeeId = Number(req.body?.employeeId);
    const year = Number(req.body?.year);
    const quarter = req.body?.quarter != null ? Number(req.body.quarter) : null;
    const newScore = Number(req.body?.newScore);
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ message: 'reason required' });

    let previousScore = null;
    if (quarter) {
      const r = await pool.query(
        `SELECT admin_final_quarter_score FROM performance_reviews WHERE employee_id = $1 AND year = $2 AND quarter = $3`,
        [employeeId, year, quarter]
      );
      previousScore = r.rows[0]?.admin_final_quarter_score;
      await pool.query(
        `UPDATE performance_reviews SET admin_final_quarter_score = $4, updated_at = NOW() WHERE employee_id = $1 AND year = $2 AND quarter = $3`,
        [employeeId, year, quarter, newScore]
      );
      const col = `q${quarter}_score`;
      await pool.query(`UPDATE annual_appraisals SET ${col} = $3 WHERE employee_id = $1 AND year = $2`, [
        employeeId,
        year,
        newScore,
      ]);
    } else {
      const r = await pool.query(`SELECT annual_score FROM annual_appraisals WHERE employee_id = $1 AND year = $2`, [
        employeeId,
        year,
      ]);
      previousScore = r.rows[0]?.annual_score;
      await pool.query(`UPDATE annual_appraisals SET annual_score = $3 WHERE employee_id = $1 AND year = $2`, [
        employeeId,
        year,
        newScore,
      ]);
    }

    await pool.query(
      `INSERT INTO performance_rating_overrides (employee_id, year, quarter, previous_score, new_score, reason, admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [employeeId, year, quarter, previousScore, newScore, reason, req.user.id]
    );

    return res.json({ message: 'Override logged' });
  } catch (err) {
    return handleErr(res, err);
  }
});

/** Meta for all portals */
router.get('/meta', async (_req, res) => {
  return res.json({ year: currentYear(), quarter: currentQuarter() });
});

module.exports = router;
