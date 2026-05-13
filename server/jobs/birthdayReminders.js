const cron = require('node-cron');
const { db } = require('../db');

function sendBirthdayNotification(employee) {
  const name = employee.name || 'Team member';
  const msg = `${name}'s birthday is today 🎂 — send them a message!`;
  // Stub: replace with email (nodemailer) or in-app notifications when available
  console.log('[AVGC Birthday]', msg);
}

function runBirthdayCheck() {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');

  const matches = db
    .prepare(
      `
      SELECT id, name, email, dateofbirth
      FROM employees
      WHERE dateofbirth IS NOT NULL
        AND length(trim(dateofbirth)) >= 10
        AND substr(dateofbirth, 6, 5) = ?
    `
    )
    .all(`${mm}-${dd}`);

  for (const row of matches) {
    sendBirthdayNotification(row);
  }

  if (matches.length) {
    console.log(`[AVGC Birthday] Processed ${matches.length} birthday(s) for ${today.toISOString().slice(0, 10)}`);
  }
}

/**
 * Daily at 08:00 server local time
 */
function startBirthdayReminderJob() {
  cron.schedule('0 8 * * *', () => {
    try {
      runBirthdayCheck();
    } catch (e) {
      console.error('[AVGC Birthday] Job error:', e.message);
    }
  });
  console.log('[AVGC Birthday] Scheduled daily reminders at 08:00 (server time)');
}

module.exports = { startBirthdayReminderJob, runBirthdayCheck };
