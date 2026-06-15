const { pool } = require('../db');
const { ensureHomeRecognitionTable } = require('./homeRecognition');
const { ensureSocialPostsTables } = require('./socialPosts');
const { ensureSocialTournamentTables } = require('./socialTournaments');

let oneTimeMigrationsDone = false;

async function ensurePolicyChatDocumentsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS policy_chat_documents (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      uploaded_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_policy_chat_documents_uploaded ON policy_chat_documents (uploaded_at DESC)'
  );
}

async function seedPoshQuizIfEmpty() {
  const poshCount = await pool.query('SELECT COUNT(*)::int AS c FROM posh_quiz_questions');
  if ((poshCount.rows[0]?.c || 0) > 0) return;

  const defaults = [
    ['What does POSH stand for?', 'Prevention of Sexual Harassment', 'Protection of Staff Health', 'Policy on Safety Hazards', 'Prevention of Staff Harm', 'a'],
    ['Who can file a complaint under the POSH Act?', 'Only women employees', 'Any aggrieved woman', 'Only managers', 'Only HR', 'b'],
    ['What is an Internal Committee (IC)?', 'A team that handles POSH complaints', 'An IT support group', 'A finance audit team', 'A marketing committee', 'a'],
    ['Within how many days should a written complaint ideally be filed?', '30 days', '90 days', '7 days', '365 days', 'b'],
    ['What should you do if you witness harassment?', 'Ignore it', 'Report it to HR or the IC', 'Post on social media', 'Confront aggressively', 'b'],
  ];
  for (let i = 0; i < defaults.length; i += 1) {
    const [q, a, b, c, d, correct] = defaults[i];
    await pool.query(
      `
        INSERT INTO posh_quiz_questions (question, option_a, option_b, option_c, option_d, correct_option, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [q, a, b, c, d, correct, i + 1]
    );
  }
  await pool.query(
    `INSERT INTO posh_config (id, video_url) VALUES (1, NULL) ON CONFLICT (id) DO NOTHING`
  );
}

/**
 * Idempotent DDL — safe to run on every server start and first API request.
 */
async function ensureEmployeeSchemaColumns() {
  await ensurePolicyChatDocumentsTable();

  await pool.query(
    'ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_first_login BOOLEAN NOT NULL DEFAULT TRUE'
  );
  await pool.query(
    'ALTER TABLE employees ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE'
  );
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT');
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT');
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account_name TEXT');
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account_number TEXT');
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_ifsc TEXT');
  await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation TEXT');
  await pool.query(
    'ALTER TABLE employees ADD COLUMN IF NOT EXISTS reporting_to_id INTEGER REFERENCES employees(id) ON DELETE SET NULL'
  );
  await pool.query(
    'ALTER TABLE leaves ADD COLUMN IF NOT EXISTS reporting_to_id INTEGER REFERENCES employees(id) ON DELETE SET NULL'
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exit_requests (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      initiated_by_admin INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      last_working_day DATE,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exit_clearances (
      id SERIAL PRIMARY KEY,
      exit_request_id INTEGER NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
      clearance_type VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      approved_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      remarks TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (exit_request_id, clearance_type)
    )
  `);
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exit_manager_submissions (
      id SERIAL PRIMARY KEY,
      exit_request_id INTEGER NOT NULL UNIQUE REFERENCES exit_requests(id) ON DELETE CASCADE,
      knowledge_transfer_summary TEXT,
      pending_tasks_status TEXT,
      handover_person_name TEXT,
      confirmed BOOLEAN NOT NULL DEFAULT FALSE,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS onboarding_tasks (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      task_key VARCHAR(100) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      completed_at TIMESTAMPTZ,
      meta JSONB,
      UNIQUE (employee_id, task_key)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posh_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      video_url TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posh_quiz_questions (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('a', 'b', 'c', 'd')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posh_quiz_attempts (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      passed BOOLEAN NOT NULL,
      answers JSONB,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await ensureHomeRecognitionTable();
  await ensureSocialPostsTables();
  await ensureSocialTournamentTables();

  const { ensurePerformanceSchema } = require('./performanceSchema');
  await ensurePerformanceSchema();

  try {
    await seedPoshQuizIfEmpty();
  } catch (err) {
    console.warn('[schema] POSH seed skipped:', err.message);
  }

  if (!oneTimeMigrationsDone) {
    await pool.query(`
      UPDATE employees SET is_first_login = FALSE
      WHERE is_first_login = TRUE AND createdat < NOW() - INTERVAL '1 minute'
    `);
    oneTimeMigrationsDone = true;
  }

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_attendancelogs_employee_date ON attendancelogs (employeeid, date)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (userid, createdat DESC)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_leaves_employee_status ON leaves (employeeid, status)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_manageremployees_manager ON manageremployees (managerid, employeeid)'
  );
}

module.exports = { ensureEmployeeSchemaColumns };
