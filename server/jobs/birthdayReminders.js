const cron = require('node-cron');
const { pool } = require('../db');

function todayKey() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return { isoDate: `${yyyy}-${mm}-${dd}`, md: `${mm}-${dd}` };
}

async function findBirthdayEmployees(md) {
  const { rows } = await pool.query(
    `
      SELECT id, name, email, dateofbirth
      FROM employees
      WHERE dateofbirth IS NOT NULL
        AND char_length(trim(dateofbirth)) >= 10
        AND substring(dateofbirth from 6 for 5) = $1
    `,
    [md]
  );
  return rows;
}

async function allActiveRecipients() {
  const { rows } = await pool.query(
    `
      SELECT id FROM employees
      WHERE COALESCE(isregistered, TRUE) = TRUE
    `
  );
  return rows;
}

async function insertBirthdayNotifications(birthdayRow, eventdate) {
  const name = birthdayRow.name || 'Team member';
  const message = `🎂 Today is ${name}'s birthday!`;
  const recipients = await allActiveRecipients();

  for (const r of recipients) {
    const exists = await pool.query(
      `SELECT 1 FROM notifications WHERE userid = $1 AND type = 'birthday' AND subjectemployeeid = $2 AND eventdate = $3`,
      [r.id, birthdayRow.id, eventdate]
    );
    if (exists.rows.length > 0) continue;

    await pool.query(
      `INSERT INTO notifications (userid, message, type, isread, subjectemployeeid, eventdate) VALUES ($1, $2, 'birthday', FALSE, $3, $4)`,
      [r.id, message, birthdayRow.id, eventdate]
    );
  }
}

async function runBirthdayCheck() {
  const { isoDate, md } = todayKey();
  const matches = await findBirthdayEmployees(md);

  if (!matches.length) {
    console.log(`[AVGC Birthday] ${isoDate}: no birthdays (month-day ${md})`);
    return;
  }

  const names = matches.map((m) => m.name || '(unnamed)').join(', ');
  console.log(`[AVGC Birthday] ${isoDate}: ${matches.length} birthday(s): ${names}`);

  for (const row of matches) {
    await insertBirthdayNotifications(row, isoDate);
  }

  console.log(`[AVGC Birthday] Inserted portal notifications for ${matches.length} birthday(s).`);
}

/**
 * Daily at 08:00 server local time
 */
function startBirthdayReminderJob() {
  cron.schedule('0 8 * * *', () => {
    runBirthdayCheck().catch((e) => {
      console.error('[AVGC Birthday] Job error:', e.message);
    });
  });
  console.log('[AVGC Birthday] Scheduled daily reminders at 08:00 (server time)');
}

module.exports = { startBirthdayReminderJob, runBirthdayCheck };
