const { pool } = require('../db');

async function ensureRegularizationTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_regularization_requests (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      attendance_date DATE NOT NULL,
      request_type TEXT NOT NULL CHECK (request_type IN ('regularize', 'regularize_and_leave')),
      reason TEXT,
      leave_type TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewed_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_attendance_reg_employee_date
    ON attendance_regularization_requests (employee_id, attendance_date DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_attendance_reg_status
    ON attendance_regularization_requests (status, created_at DESC)
  `);
}

function mapRegularizationRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeecode: row.employeecode,
    attendanceDate: row.attendance_date,
    requestType: row.request_type,
    reason: row.reason,
    leaveType: row.leave_type,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

async function createRegularizationRequest({ employeeId, attendanceDate, requestType, reason, leaveType }) {
  await ensureRegularizationTable();
  const { rows } = await pool.query(
    `
      INSERT INTO attendance_regularization_requests
        (employee_id, attendance_date, request_type, reason, leave_type)
      VALUES ($1, $2::date, $3, $4, $5)
      RETURNING id
    `,
    [employeeId, attendanceDate, requestType, reason || null, leaveType || null]
  );
  return rows[0]?.id;
}

async function listRegularizationForEmployee(employeeId) {
  await ensureRegularizationTable();
  const { rows } = await pool.query(
    `
      SELECT r.*, e.name AS employee_name, e.employeecode
      FROM attendance_regularization_requests r
      JOIN employees e ON e.id = r.employee_id
      WHERE r.employee_id = $1
      ORDER BY r.created_at DESC
      LIMIT 100
    `,
    [employeeId]
  );
  return rows.map(mapRegularizationRow);
}

async function listPendingRegularizationForHr() {
  await ensureRegularizationTable();
  const { rows } = await pool.query(
    `
      SELECT r.*, e.name AS employee_name, e.employeecode
      FROM attendance_regularization_requests r
      JOIN employees e ON e.id = r.employee_id
      WHERE r.status = 'pending'
      ORDER BY r.created_at ASC
    `
  );
  return rows.map(mapRegularizationRow);
}

async function reviewRegularizationRequest({ id, reviewerId, action }) {
  await ensureRegularizationTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM attendance_regularization_requests WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const req = rows[0];
    if (!req) {
      const err = new Error('Request not found');
      err.status = 404;
      throw err;
    }
    if (req.status !== 'pending') {
      const err = new Error('Request already reviewed');
      err.status = 400;
      throw err;
    }

    const nextStatus = action === 'approve' ? 'approved' : 'rejected';
    await client.query(
      `
        UPDATE attendance_regularization_requests
        SET status = $1, reviewed_by = $2, reviewed_at = NOW()
        WHERE id = $3
      `,
      [nextStatus, reviewerId, id]
    );

    if (action === 'approve' && req.request_type === 'regularize_and_leave') {
      const leaveType = req.leave_type || 'casual';
      await client.query(
        `
          INSERT INTO leaves (employeeid, leavetype, fromdate, todate, reason, status, approvedby)
          VALUES ($1, $2, $3::date, $3::date, $4, 'approved', $5)
        `,
        [
          req.employee_id,
          leaveType,
          req.attendance_date,
          req.reason || 'Regularization with leave',
          reviewerId,
        ]
      );
      await client.query(
        `
          INSERT INTO attendancelogs (employeeid, date, totalhours, status)
          VALUES ($1, $2::date, 0, 'leave')
          ON CONFLICT (employeeid, date) DO UPDATE SET status = 'leave', totalhours = 0
        `,
        [req.employee_id, req.attendance_date]
      );
    }

    await client.query('COMMIT');
    return { id, status: nextStatus };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  ensureRegularizationTable,
  createRegularizationRequest,
  listRegularizationForEmployee,
  listPendingRegularizationForHr,
  reviewRegularizationRequest,
  mapRegularizationRow,
};
