const cron = require('node-cron');
const { format } = require('date-fns');
const { pool } = require('../db');
const { createNotification } = require('../utils/notifications');
const { deactivateEmployee } = require('../utils/exitHelpers');

async function processExitDeactivations() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const { rows } = await pool.query(
    `
      SELECT er.id, er.employee_id, e.name
      FROM exit_requests er
      JOIN employees e ON e.id = er.employee_id
      WHERE er.status IN ('serving_notice', 'clearances_pending', 'letters_ready', 'in_progress')
        AND COALESCE(er.confirmed_last_working_day, er.last_working_day) <= $1::date
        AND COALESCE(e.is_active, TRUE) = TRUE
    `,
    [today]
  );

  for (const row of rows) {
    await deactivateEmployee(row.employee_id);
    await pool.query(
      `UPDATE exit_requests SET status = 'completed' WHERE id = $1 AND status != 'completed'`,
      [row.id]
    );
    await createNotification(
      row.employee_id,
      'exit_completed',
      `Your employment with AVGC Studios has been concluded as of ${today}. We wish you all the best.`,
      { subjectEmployeeId: row.employee_id }
    );
    console.log(`[AVGC] Exit deactivation processed for employee ${row.employee_id} (${row.name})`);
  }
}

function startExitDeactivationJob() {
  cron.schedule('30 0 * * *', () => {
    processExitDeactivations().catch((err) => {
      console.error('[AVGC] Exit deactivation job failed:', err.message);
    });
  });
  console.log('[AVGC] Exit deactivation cron scheduled (daily 00:30)');
}

module.exports = { startExitDeactivationJob, processExitDeactivations };
