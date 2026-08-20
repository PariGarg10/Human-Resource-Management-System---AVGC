/**
 * Production deploy migration manifest.
 *
 * APPLY  — schema / feature DDL + Super Admin-only data updates
 * SKIP   — record as applied without executing (avoids touching other prod data)
 *
 * Local dev: use `npm run db:migrate` to apply everything including SKIP entries.
 * Production deploy: `npm run db:migrate:deploy` or server startup (production mode).
 */

/** Safe for production — tables, columns, constraints, Super Admin + Saturday config */
const DEPLOY_APPLY = new Set([
  '2026_07_11_update_employees.sql',
  '2026_07_24_super_admin_name.sql',
  '2026_07_24_super_admin_profile.sql',
  '2026_07_27_efficiency_tracking.sql',
  '2026_08_02_efficiency_wd_overrides.sql',
  '2026_08_03_work_log_remarks.sql',
  '2026_08_08_work_log_actual_manhours.sql',
  '2026_08_21_work_logs_multi_and_resubmit.sql',
  '2026_08_21_saturday_alternate_defaults.sql',
  '2026_08_21_super_admin_admin_role.sql',
  '2026_08_21_super_admin_profile.sql',
  '2026_08_21_super_admin_designation_admin.sql',
  '2026_08_21_super_admin_emp_code.sql',
]);

/** Do not run on production — record as applied without executing */
const DEPLOY_SKIP = new Set([]);

function classifyDeployMigration(filename) {
  if (DEPLOY_APPLY.has(filename)) return 'apply';
  if (DEPLOY_SKIP.has(filename)) return 'skip';
  return 'unknown';
}

module.exports = {
  DEPLOY_APPLY,
  DEPLOY_SKIP,
  classifyDeployMigration,
};
