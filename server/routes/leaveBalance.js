const express = require('express');
const { pool } = require('../db');
const { authMiddleware, enforcePasswordChange } = require('../middleware/auth');
const { getLeaveBalance } = require('../utils/leaveBalance');
const { isValidPortalYear } = require('../constants/portalYear');

const router = express.Router();
router.use(authMiddleware);
router.use(enforcePasswordChange);

async function canAccessEmployee(req, employeeId) {
  if (req.user.id === employeeId) return true;
  if (req.user.role === 'admin') return true;
  if (req.user.role !== 'manager') return false;

  const result = await pool.query(
    'SELECT 1 FROM manageremployees WHERE managerid = $1 AND employeeid = $2 LIMIT 1',
    [req.user.id, employeeId]
  );
  return result.rows.length > 0;
}

router.get('/:employeeId', async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return res.status(400).json({ message: 'Valid employeeId is required' });
    }
    if (!isValidPortalYear(year)) {
      return res.status(400).json({ message: 'Valid year is required' });
    }

    const employeeResult = await pool.query(
      'SELECT id, name, employeecode FROM employees WHERE id = $1',
      [employeeId]
    );
    const employee = employeeResult.rows[0];
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (!(await canAccessEmployee(req, employeeId))) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }

    const balance = await getLeaveBalance(employeeId, year);
    return res.json({
      employee,
      ...balance,
    });
  } catch (err) {
    console.error('GET /leave-balance:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
