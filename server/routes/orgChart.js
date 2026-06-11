const express = require('express');
const { pool } = require('../db');
const { authMiddleware, enforcePasswordChange } = require('../middleware/auth');
const { isAdminRole } = require('../constants/roles');
const { buildFocusedOrgChart } = require('../utils/focusedOrgChart');

const router = express.Router();

async function fetchOrgEmployeeRows() {
  const [employeesResult, assignmentsResult] = await Promise.all([
    pool.query(
      `
      SELECT id, employeecode, name, email, department, designation, role, reporting_to_id,
             profilephotourl, phone, location,
             (profile_photo IS NOT NULL) AS has_profile_photo
      FROM employees
      WHERE COALESCE(isregistered, TRUE) = TRUE
      ORDER BY name ASC
    `
    ),
    pool.query('SELECT managerid, employeeid FROM manageremployees'),
  ]);
  return { employees: employeesResult.rows, assignments: assignmentsResult.rows };
}

router.get('/focused/:employeeId', authMiddleware, enforcePasswordChange, async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return res.status(400).json({ message: 'Invalid employee id' });
    }

    const { employees, assignments } = await fetchOrgEmployeeRows();
    const viewerRow = employees.find((row) => row.id === req.user.id);
    const viewerRole = viewerRow?.role || req.user.role;

    if (req.user.id !== employeeId && !isAdminRole(viewerRole)) {
      return res.status(403).json({ message: 'You can only view your own focused org chart' });
    }

    const focused = buildFocusedOrgChart(employeeId, employees, assignments);
    if (!focused) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    return res.json(focused);
  } catch (err) {
    console.error('GET /org-chart/focused/:employeeId:', err.message, err.stack);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
