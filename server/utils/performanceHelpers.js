const { pool } = require('../db');

function currentYear() {
  return new Date().getFullYear();
}

function currentQuarter() {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

function parseYearQuarter(query) {
  const year = Number(query?.year) || currentYear();
  const quarter = Number(query?.quarter) || currentQuarter();
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    const err = new Error('Invalid year');
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    const err = new Error('Invalid quarter');
    err.status = 400;
    throw err;
  }
  return { year, quarter };
}

async function isManagerOf(managerId, employeeId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM manageremployees WHERE managerid = $1 AND employeeid = $2 LIMIT 1`,
    [managerId, employeeId]
  );
  return Boolean(rows[0]);
}

async function getDirectReportIds(managerId) {
  const { rows } = await pool.query(
    `SELECT employeeid FROM manageremployees WHERE managerid = $1 ORDER BY employeeid`,
    [managerId]
  );
  return rows.map((r) => r.employeeid);
}

function sumOkrWeightage(okrs) {
  return okrs.reduce((s, o) => s + Number(o.weightage || 0), 0);
}

function validateOkrPayload(okrs) {
  if (!Array.isArray(okrs) || okrs.length === 0) {
    const err = new Error('At least one OKR is required');
    err.status = 400;
    throw err;
  }
  for (const o of okrs) {
    if (!String(o.objective || '').trim() || !String(o.keyResult || o.key_result || '').trim()) {
      const err = new Error('Each OKR needs objective and key result');
      err.status = 400;
      throw err;
    }
    if (!String(o.kra || '').trim() || !String(o.kpi || '').trim()) {
      const err = new Error('Each OKR must map to KRA and KPI');
      err.status = 400;
      throw err;
    }
    const w = Number(o.weightage);
    if (!Number.isFinite(w) || w <= 0) {
      const err = new Error('Each OKR weightage must be positive');
      err.status = 400;
      throw err;
    }
  }
  const total = sumOkrWeightage(okrs);
  if (Math.abs(total - 100) > 0.01) {
    const err = new Error(`OKR weightage must total 100 (current: ${total})`);
    err.status = 400;
    throw err;
  }
}

function mapOkrRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    quarter: row.quarter,
    year: row.year,
    objective: row.objective,
    keyResult: row.key_result,
    kra: row.kra,
    kpi: row.kpi,
    weightage: Number(row.weightage),
    progressPercent: row.progress_percent != null ? Number(row.progress_percent) : 0,
    status: row.status,
    managerNotes: row.manager_notes || null,
  };
}

function computeAdminQuarterScore(adminRatings, okrs) {
  const ratingMap = new Map(
    (adminRatings || []).map((r) => [Number(r.okrId || r.okr_id), Number(r.score || r.rating || 0)])
  );
  let total = 0;
  for (const okr of okrs) {
    const score = ratingMap.get(okr.id) ?? 0;
    total += Math.min(Number(score), Number(okr.weightage));
  }
  return Math.round(total * 100) / 100;
}

async function getQuarterWeights(year) {
  const { rows } = await pool.query(`SELECT * FROM performance_quarter_weights WHERE year = $1`, [year]);
  if (rows[0]) {
    return {
      q1: Number(rows[0].q1_weight),
      q2: Number(rows[0].q2_weight),
      q3: Number(rows[0].q3_weight),
      q4: Number(rows[0].q4_weight),
    };
  }
  return { q1: 25, q2: 25, q3: 25, q4: 25 };
}

function computeAnnualScore(scores, weights) {
  const q = [scores.q1, scores.q2, scores.q3, scores.q4];
  const w = [weights.q1, weights.q2, weights.q3, weights.q4];
  const wSum = w.reduce((a, b) => a + b, 0) || 100;
  let total = 0;
  for (let i = 0; i < 4; i += 1) {
    if (q[i] == null || !Number.isFinite(Number(q[i]))) return null;
    total += (Number(q[i]) * w[i]) / wSum;
  }
  return Math.round(total * 100) / 100;
}

async function getRatingBands() {
  const { rows } = await pool.query(`SELECT * FROM rating_band_config ORDER BY min_score DESC`);
  return rows;
}

async function bandForScore(score) {
  const bands = await getRatingBands();
  const s = Number(score);
  for (const b of bands) {
    if (s >= Number(b.min_score) && s <= Number(b.max_score)) {
      return b;
    }
  }
  return bands[bands.length - 1] || null;
}

function reviewForEmployee(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employee_id,
    quarter: row.quarter,
    year: row.year,
    selfRatingPerOkr: row.self_rating_per_okr || [],
    selfCategoryRatings: row.self_category_ratings || {},
    selfOverallRating: row.self_overall_rating != null ? Number(row.self_overall_rating) : null,
    selfFeedback: row.self_feedback || null,
    adminFinalQuarterScore:
      row.status === 'LOCKED' && row.admin_final_quarter_score != null
        ? Number(row.admin_final_quarter_score)
        : null,
    status: row.status,
    lockedAt: row.locked_at || null,
  };
}

/** Employee view after manager submits — includes manager KRA ratings & feedback. */
function reviewForEmployeeManagerVisible(row) {
  const base = reviewForEmployee(row);
  if (!row || !base) return base;
  if (!['MANAGER SUBMITTED', 'LOCKED'].includes(row.status)) return base;
  return {
    ...base,
    managerRatingPerOkr: row.manager_rating_per_okr || [],
    managerFeedbackPerOkr: row.manager_feedback_per_okr || [],
    managerOverallRating: row.manager_overall_rating != null ? Number(row.manager_overall_rating) : null,
    managerFeedback: row.manager_feedback || null,
  };
}

function mapReviewStatusForAdmin(status, okrCount, okrsLocked) {
  if (!okrCount) return 'not_started';
  if (!okrsLocked && (!status || status === 'PENDING')) return 'self_review';
  if (status === 'PENDING' && okrsLocked) return 'self_review';
  if (status === 'SELF SUBMITTED') return 'manager_review';
  if (status === 'MANAGER SUBMITTED') return 'manager_review';
  if (status === 'LOCKED') return 'completed';
  return 'not_started';
}

function reviewForManager(row) {
  if (!row) return null;
  return {
    ...reviewForEmployee(row),
    managerRatingPerOkr: row.manager_rating_per_okr || [],
    managerFeedbackPerOkr: row.manager_feedback_per_okr || [],
    managerOverallRating: row.manager_overall_rating != null ? Number(row.manager_overall_rating) : null,
    managerFeedback: row.manager_feedback || null,
  };
}

function reviewForAdmin(row) {
  if (!row) return null;
  return {
    ...reviewForManager(row),
    adminRatingPerOkr: row.admin_rating_per_okr || [],
    adminFinalQuarterScore: row.admin_final_quarter_score != null ? Number(row.admin_final_quarter_score) : null,
    unlockedBy: row.unlocked_by || null,
    unlockedAt: row.unlocked_at || null,
  };
}

async function ensureReviewRow(employeeId, year, quarter) {
  const existing = await pool.query(
    `SELECT * FROM performance_reviews WHERE employee_id = $1 AND year = $2 AND quarter = $3`,
    [employeeId, year, quarter]
  );
  if (existing.rows[0]) return existing.rows[0];
  const { rows } = await pool.query(
    `INSERT INTO performance_reviews (employee_id, year, quarter, status)
     VALUES ($1, $2, $3, 'PENDING') RETURNING *`,
    [employeeId, year, quarter]
  );
  return rows[0];
}

async function getOkrs(employeeId, year, quarter) {
  const { rows } = await pool.query(
    `SELECT * FROM okr_definitions WHERE employee_id = $1 AND year = $2 AND quarter = $3 ORDER BY id`,
    [employeeId, year, quarter]
  );
  return rows.map(mapOkrRow);
}

function okrsLocked(okrs) {
  return okrs.length > 0 && okrs.every((o) => o.status === 'LOCKED');
}

module.exports = {
  currentYear,
  currentQuarter,
  parseYearQuarter,
  isManagerOf,
  getDirectReportIds,
  sumOkrWeightage,
  validateOkrPayload,
  mapOkrRow,
  computeAdminQuarterScore,
  getQuarterWeights,
  computeAnnualScore,
  getRatingBands,
  bandForScore,
  reviewForEmployee,
  reviewForEmployeeManagerVisible,
  mapReviewStatusForAdmin,
  reviewForManager,
  reviewForAdmin,
  ensureReviewRow,
  getOkrs,
  okrsLocked,
};
