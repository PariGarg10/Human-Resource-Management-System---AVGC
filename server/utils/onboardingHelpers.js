const { pool } = require('../db');

const TASK_KEYS = [
  'profile_complete',
  'policy_read',
  'posh_training',
  'meet_team',
  'it_setup',
];

const IT_SETUP_ITEMS = [
  { key: 'email', label: 'Email setup completed' },
  { key: 'slack', label: 'Slack workspace joined' },
  { key: 'hrms', label: 'HRMS login confirmed' },
  { key: 'device', label: 'Laptop / device received' },
];

function profileCompletionPercentage(row) {
  if (!row) return 0;
  const checks = [
    row.phone,
    row.dateofbirth,
    row.location,
    row.profilephotourl,
    row.emergency_contact_name,
    row.emergency_contact_phone,
    row.bank_account_name,
    row.bank_account_number,
    row.bank_ifsc,
  ];
  const filled = checks.filter((v) => v && String(v).trim()).length;
  return Math.round((filled / checks.length) * 100);
}

function defaultItMeta() {
  return {
    items: Object.fromEntries(IT_SETUP_ITEMS.map((i) => [i.key, false])),
  };
}

async function ensureOnboardingTasks(employeeId) {
  for (const taskKey of TASK_KEYS) {
    const meta = taskKey === 'it_setup' ? JSON.stringify(defaultItMeta()) : null;
    await pool.query(
      `
        INSERT INTO onboarding_tasks (employee_id, task_key, status, meta)
        VALUES ($1, $2, 'pending', $3::jsonb)
        ON CONFLICT (employee_id, task_key) DO NOTHING
      `,
      [employeeId, taskKey, meta]
    );
  }
}

async function syncProfileTask(employeeId) {
  const { rows } = await pool.query(
    `
      SELECT phone, dateofbirth, location, profilephotourl,
             emergency_contact_name, emergency_contact_phone,
             bank_account_name, bank_account_number, bank_ifsc
      FROM employees WHERE id = $1
    `,
    [employeeId]
  );
  const pct = profileCompletionPercentage(rows[0]);
  if (pct >= 100) {
    await pool.query(
      `
        UPDATE onboarding_tasks
        SET status = 'completed', completed_at = COALESCE(completed_at, NOW())
        WHERE employee_id = $1 AND task_key = 'profile_complete' AND status != 'completed'
      `,
      [employeeId]
    );
  }
  return pct;
}

async function checkAndCompleteOnboarding(employeeId) {
  const { rows } = await pool.query(
    `
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS done
      FROM onboarding_tasks
      WHERE employee_id = $1
    `,
    [employeeId]
  );
  const { total, done } = rows[0] || { total: 0, done: 0 };
  if (total > 0 && done >= total) {
    await pool.query(
      `UPDATE employees SET onboarding_completed = TRUE WHERE id = $1`,
      [employeeId]
    );
    return true;
  }
  return false;
}

function mapTaskRow(row) {
  return {
    id: row.id,
    taskKey: row.task_key,
    status: row.status,
    completedAt: row.completed_at,
    meta: row.meta || null,
  };
}

function progressFromTasks(tasks) {
  if (!tasks.length) return 0;
  const done = tasks.filter((t) => t.status === 'completed').length;
  return Math.round((done / tasks.length) * 100);
}

module.exports = {
  TASK_KEYS,
  IT_SETUP_ITEMS,
  profileCompletionPercentage,
  defaultItMeta,
  ensureOnboardingTasks,
  syncProfileTask,
  checkAndCompleteOnboarding,
  mapTaskRow,
  progressFromTasks,
};
