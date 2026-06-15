const { pool } = require('../db');

let schemaEnsured = false;

const LEGACY_TABLES = [
  'manager_recognition_notes',
  'performance_mvp_highlights',
  'performance_improvement_plans',
  'performance_peer_reviews',
  'performance_final_ratings',
  'performance_manager_evaluations',
  'performance_self_assessments',
  'goal_progress_updates',
  'performance_goals',
  'performance_cycles',
];

async function dropLegacyPerformanceTables() {
  for (const table of LEGACY_TABLES) {
    await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

async function seedAppraisalCategories() {
  const defaults = ['Ownership', 'Quality of Work', 'Collaboration', 'Timeliness', 'Innovation'];
  for (const name of defaults) {
    await pool.query(
      `INSERT INTO appraisal_categories (name, active) VALUES ($1, TRUE)
       ON CONFLICT (name) DO NOTHING`,
      [name]
    );
  }
}

async function seedRatingBands() {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM rating_band_config`);
  if (rows[0]?.c > 0) return;
  const bands = [
    { band_label: 'Outstanding', min_score: 90, max_score: 100, rating_value: 5, increment_percent: 12, bonus_percent: 15 },
    { band_label: 'Exceeds Expectation', min_score: 75, max_score: 89, rating_value: 4, increment_percent: 8, bonus_percent: 10 },
    { band_label: 'Meets Expectation', min_score: 60, max_score: 74, rating_value: 3, increment_percent: 5, bonus_percent: 5 },
    { band_label: 'Needs Improvement', min_score: 45, max_score: 59, rating_value: 2, increment_percent: 0, bonus_percent: 0 },
    { band_label: 'Unsatisfactory', min_score: 0, max_score: 44, rating_value: 1, increment_percent: 0, bonus_percent: 0 },
  ];
  for (const b of bands) {
    await pool.query(
      `INSERT INTO rating_band_config (band_label, min_score, max_score, rating_value, increment_percent, bonus_percent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [b.band_label, b.min_score, b.max_score, b.rating_value, b.increment_percent, b.bonus_percent]
    );
  }
}

async function ensurePerformanceSchema() {
  if (schemaEnsured) return;
  await dropLegacyPerformanceTables();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS appraisal_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rating_band_config (
      id SERIAL PRIMARY KEY,
      band_label TEXT NOT NULL,
      min_score NUMERIC(6,2) NOT NULL,
      max_score NUMERIC(6,2) NOT NULL,
      rating_value INTEGER NOT NULL,
      increment_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
      bonus_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_cycles (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      initialized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      initialized_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      stopped_at TIMESTAMPTZ,
      UNIQUE (year, quarter)
    )
  `);

  await pool.query(`
    INSERT INTO performance_cycles (year, quarter, status)
    SELECT DISTINCT year, quarter, 'ACTIVE'
    FROM performance_reviews
    ON CONFLICT (year, quarter) DO NOTHING
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_quarter_weights (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL UNIQUE,
      q1_weight NUMERIC(5,2) NOT NULL DEFAULT 25,
      q2_weight NUMERIC(5,2) NOT NULL DEFAULT 25,
      q3_weight NUMERIC(5,2) NOT NULL DEFAULT 25,
      q4_weight NUMERIC(5,2) NOT NULL DEFAULT 25,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS okr_definitions (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
      year INTEGER NOT NULL,
      objective TEXT NOT NULL,
      key_result TEXT NOT NULL,
      kra TEXT NOT NULL,
      kpi TEXT NOT NULL,
      weightage NUMERIC(6,2) NOT NULL CHECK (weightage > 0),
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
      manager_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_okr_employee_period
    ON okr_definitions (employee_id, year, quarter)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_reviews (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
      year INTEGER NOT NULL,
      self_rating_per_okr JSONB NOT NULL DEFAULT '[]',
      self_category_ratings JSONB NOT NULL DEFAULT '{}',
      self_overall_rating NUMERIC(4,2),
      self_feedback TEXT,
      manager_rating_per_okr JSONB NOT NULL DEFAULT '[]',
      manager_overall_rating NUMERIC(4,2),
      manager_feedback TEXT,
      admin_rating_per_okr JSONB NOT NULL DEFAULT '[]',
      admin_final_quarter_score NUMERIC(6,2),
      status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      unlocked_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      unlocked_at TIMESTAMPTZ,
      locked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (employee_id, year, quarter)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annual_appraisals (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      q1_score NUMERIC(6,2),
      q2_score NUMERIC(6,2),
      q3_score NUMERIC(6,2),
      q4_score NUMERIC(6,2),
      annual_score NUMERIC(6,2),
      rating_band TEXT,
      rating_value INTEGER,
      increment_percent NUMERIC(6,2),
      bonus_amount NUMERIC(12,2),
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
      finalised_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (employee_id, year)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_rating_overrides (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      quarter INTEGER CHECK (quarter IS NULL OR quarter BETWEEN 1 AND 4),
      previous_score NUMERIC(6,2),
      new_score NUMERIC(6,2),
      reason TEXT NOT NULL,
      admin_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_components (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      variable_bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
      source VARCHAR(50) NOT NULL DEFAULT 'performance',
      performance_year INTEGER,
      uploaded_at TIMESTAMPTZ,
      uploaded_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (employee_id, year, source)
    )
  `);

  await pool.query(`
    ALTER TABLE performance_reviews
    ADD COLUMN IF NOT EXISTS manager_feedback_per_okr JSONB NOT NULL DEFAULT '[]'
  `);

  await pool.query(`
    ALTER TABLE okr_definitions
    ADD COLUMN IF NOT EXISTS progress_percent NUMERIC(5,2) DEFAULT 0
  `);

  await seedAppraisalCategories();
  await seedRatingBands();
  schemaEnsured = true;
}

module.exports = { ensurePerformanceSchema };
