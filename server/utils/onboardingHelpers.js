const { pool } = require('../db');

const TASK_KEYS = [
  'profile_complete',
  'policy_read',
  'posh_training',
  'meet_team',
];

const IT_SETUP_ITEMS = [
  { key: 'email', label: 'Email setup completed' },
  { key: 'slack', label: 'Slack workspace joined' },
  { key: 'hrms', label: 'HRMS login confirmed' },
  { key: 'device', label: 'Laptop / device received' },
];

const REQUIRED_ONBOARDING_DOCUMENTS = Object.freeze(['aadhar', 'pan', 'cancelled_cheque']);

const PROFILE_FIELD_CHECKS = Object.freeze([
  { key: 'phone', label: 'Phone number', getValue: (row) => row?.phone },
  { key: 'dateofbirth', label: 'Date of birth', getValue: (row) => row?.dateofbirth },
  { key: 'location', label: 'Location', getValue: (row) => row?.location },
  {
    key: 'profile_photo',
    label: 'Profile photo',
    getValue: (row) =>
      row?.has_profile_photo === true || row?.has_profile_photo === 't' || row?.profilephotourl,
  },
  { key: 'emergency_contact_name', label: 'Emergency contact name', getValue: (row) => row?.emergency_contact_name },
  { key: 'emergency_contact_phone', label: 'Emergency contact phone', getValue: (row) => row?.emergency_contact_phone },
  { key: 'bank_account_name', label: 'Bank account name', getValue: (row) => row?.bank_account_name },
  { key: 'bank_account_number', label: 'Bank account number', getValue: (row) => row?.bank_account_number },
  { key: 'bank_ifsc', label: 'Bank IFSC', getValue: (row) => row?.bank_ifsc },
]);

function fieldIsFilled(value) {
  return Boolean(value && String(value).trim());
}

function missingProfileFieldsFromRow(row) {
  if (!row) return PROFILE_FIELD_CHECKS.map((field) => ({ key: field.key, label: field.label }));
  return PROFILE_FIELD_CHECKS.filter((field) => !fieldIsFilled(field.getValue(row))).map((field) => ({
    key: field.key,
    label: field.label,
  }));
}

async function uploadedEmployeeDocumentCategories(employeeId) {
  const { rows } = await pool.query(
    `
      SELECT DISTINCT category
      FROM employee_documents
      WHERE employee_id = $1 AND source = 'employee'
    `,
    [employeeId]
  );
  return new Set(rows.map((r) => r.category));
}

function profileFieldCompletionPercentage(row) {
  if (!row) return 0;
  const filled = PROFILE_FIELD_CHECKS.filter((field) => fieldIsFilled(field.getValue(row))).length;
  return Math.round((filled / PROFILE_FIELD_CHECKS.length) * 100);
}

async function profileCompletionPercentage(row, employeeId) {
  if (!row) return 0;
  const fieldsDone = PROFILE_FIELD_CHECKS.filter((field) => fieldIsFilled(field.getValue(row))).length;
  if (!employeeId) {
    return Math.round((fieldsDone / PROFILE_FIELD_CHECKS.length) * 100);
  }
  const uploaded = await uploadedEmployeeDocumentCategories(employeeId);
  const docsDone = REQUIRED_ONBOARDING_DOCUMENTS.filter((cat) => uploaded.has(cat)).length;
  const total = PROFILE_FIELD_CHECKS.length + REQUIRED_ONBOARDING_DOCUMENTS.length;
  const done = fieldsDone + docsDone;
  if (done >= total) return 100;
  return Math.round((done / total) * 100);
}

function isProfileFullyComplete(missingFields, missingDocKeys) {
  return missingFields.length === 0 && missingDocKeys.length === 0;
}

async function missingOnboardingDocuments(employeeId) {
  const uploaded = await uploadedEmployeeDocumentCategories(employeeId);
  return REQUIRED_ONBOARDING_DOCUMENTS.filter((cat) => !uploaded.has(cat));
}

async function getProfileCompletionGaps(employeeId) {
  const { rows } = await pool.query(
    `
      SELECT phone, dateofbirth, location, profilephotourl,
             emergency_contact_name, emergency_contact_phone,
             bank_account_name, bank_account_number, bank_ifsc,
             (profile_photo IS NOT NULL) AS has_profile_photo
      FROM employees WHERE id = $1
    `,
    [employeeId]
  );
  const missingFields = missingProfileFieldsFromRow(rows[0]);
  const missingDocKeys = await missingOnboardingDocuments(employeeId);
  return { row: rows[0] || null, missingFields, missingDocKeys };
}

const ONBOARDING_TASK_LABELS = Object.freeze({
  profile_complete: 'Complete your profile',
  policy_read: 'Read company policies',
  posh_training: 'POSH training',
  meet_team: 'Meet your team',
});

function buildOnboardingBlockers(tasks, missingFields, missingDocuments) {
  const blockers = [];
  for (const taskKey of TASK_KEYS) {
    const task = tasks.find((t) => t.taskKey === taskKey);
    if (task?.status === 'completed') continue;
    const title = ONBOARDING_TASK_LABELS[taskKey] || taskKey;
    if (taskKey === 'profile_complete') {
      const details = [
        ...missingFields.map((field) => field.label),
        ...missingDocuments.map((doc) => `${doc.label} (document upload)`),
      ];
      blockers.push({ taskKey, title, details });
      continue;
    }
    blockers.push({ taskKey, title, details: [] });
  }
  return blockers;
}

function defaultItMeta() {
  return {
    items: Object.fromEntries(IT_SETUP_ITEMS.map((i) => [i.key, false])),
  };
}

async function ensureOnboardingTasks(employeeId) {
  for (const taskKey of TASK_KEYS) {
    await pool.query(
      `
        INSERT INTO onboarding_tasks (employee_id, task_key, status, meta)
        VALUES ($1, $2, 'pending', NULL)
        ON CONFLICT (employee_id, task_key) DO NOTHING
      `,
      [employeeId, taskKey]
    );
  }
}

async function syncProfileTask(employeeId) {
  const { row, missingFields, missingDocKeys } = await getProfileCompletionGaps(employeeId);
  const complete = isProfileFullyComplete(missingFields, missingDocKeys);
  const pct = complete ? 100 : await profileCompletionPercentage(row, employeeId);

  if (complete) {
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
  const empRes = await pool.query(
    'SELECT mustchangepassword, force_password_change FROM employees WHERE id = $1',
    [employeeId]
  );
  const emp = empRes.rows[0];
  if (emp && (emp.mustchangepassword || emp.force_password_change)) {
    return false;
  }

  const { rows } = await pool.query(
    `
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS done
      FROM onboarding_tasks
      WHERE employee_id = $1
        AND task_key = ANY($2::text[])
    `,
    [employeeId, TASK_KEYS]
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
  const active = tasks.filter((t) => TASK_KEYS.includes(t.taskKey));
  if (!active.length) return 0;
  const done = active.filter((t) => t.status === 'completed').length;
  return Math.round((done / active.length) * 100);
}

module.exports = {
  TASK_KEYS,
  IT_SETUP_ITEMS,
  REQUIRED_ONBOARDING_DOCUMENTS,
  profileFieldCompletionPercentage,
  profileCompletionPercentage,
  missingOnboardingDocuments,
  missingProfileFieldsFromRow,
  getProfileCompletionGaps,
  buildOnboardingBlockers,
  isProfileFullyComplete,
  ONBOARDING_TASK_LABELS,
  defaultItMeta,
  ensureOnboardingTasks,
  syncProfileTask,
  checkAndCompleteOnboarding,
  mapTaskRow,
  progressFromTasks,
};
