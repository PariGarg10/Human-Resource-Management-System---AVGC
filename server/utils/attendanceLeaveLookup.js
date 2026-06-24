const { pool } = require('../db');

/**
 * Returns employee IDs with approved leave covering `date` (single query, no N+1).
 */
async function approvedLeaveEmployeeIdsForDate(employeeIds, date) {
  const ids = [...new Set((employeeIds || []).map((id) => Number(id)).filter(Number.isFinite))];
  if (!ids.length || !date) return new Set();

  const { rows } = await pool.query(
    `
      SELECT DISTINCT employeeid
      FROM leaves
      WHERE employeeid = ANY($1::int[])
        AND status = 'approved'
        AND $2::date BETWEEN fromdate AND todate
    `,
    [ids, date]
  );
  return new Set(rows.map((r) => r.employeeid));
}

module.exports = {
  approvedLeaveEmployeeIdsForDate,
};
