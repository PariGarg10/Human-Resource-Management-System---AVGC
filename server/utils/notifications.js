const { pool } = require('../db');

async function createNotification(userId, type, message, options = {}) {
  if (!userId || !message) return null;
  const result = await pool.query(
    `
      INSERT INTO notifications (userid, message, type, isread, subjectemployeeid, eventdate)
      VALUES ($1, $2, $3, FALSE, $4, $5)
      RETURNING id
    `,
    [userId, message, type || 'info', options.subjectEmployeeId || null, options.eventDate || null]
  );
  return result.rows[0]?.id ?? null;
}

async function activeEmployeesAndManagers() {
  const { rows } = await pool.query(
    `
      SELECT id
      FROM employees
      WHERE role IN ('employee', 'manager')
        AND COALESCE(isregistered, TRUE) = TRUE
      ORDER BY id ASC
    `
  );
  return rows;
}

async function broadcastToEmployeesAndManagers(type, message, options = {}) {
  const recipients = await activeEmployeesAndManagers();
  for (const recipient of recipients) {
    await createNotification(recipient.id, type, message, options);
  }
  return recipients.length;
}

module.exports = {
  createNotification,
  broadcastToEmployeesAndManagers,
};
