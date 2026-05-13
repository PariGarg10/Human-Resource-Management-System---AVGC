const express = require('express');
const { db } = require('../db');
const { authMiddleware, enforcePasswordChange, requireRoles } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(authMiddleware);
router.use(enforcePasswordChange);

const ALLOWED_TYPES = new Set(['Sick Leave', 'Casual Leave', 'Paid Leave', 'Work From Home']);

router.post('/apply', requireRoles('employee'), (req, res) => {
  const { leavetype, fromdate, todate, reason } = req.body;
  if (!leavetype || !fromdate || !todate) {
    return res.status(400).json({ message: 'leavetype, fromdate, and todate are required' });
  }
  if (!ALLOWED_TYPES.has(leavetype)) {
    return res.status(400).json({ message: 'Invalid leave type' });
  }

  const result = db.prepare(`
    INSERT INTO leaves (employeeid, leavetype, fromdate, todate, reason, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(req.user.id, leavetype, fromdate, todate, reason || null);

  logAudit(req.user.id, 'LEAVE_APPLIED', 'leaves', { leaveId: Number(result.lastInsertRowid) });
  return res.status(201).json({ message: 'Leave request submitted', id: Number(result.lastInsertRowid) });
});

router.get('/my-leaves', requireRoles('employee'), (req, res) => {
  const leaves = db
    .prepare('SELECT * FROM leaves WHERE employeeid = ? ORDER BY createdat DESC')
    .all(req.user.id);
  return res.json({ leaves });
});

router.get('/team', requireRoles('manager'), (req, res) => {
  const leaves = db.prepare(`
    SELECT l.*, e.employeecode, e.name, e.department
    FROM leaves l
    JOIN employees e ON e.id = l.employeeid
    JOIN manageremployees me ON me.employeeid = e.id
    WHERE me.managerid = ?
    ORDER BY l.createdat DESC
  `).all(req.user.id);
  return res.json({ leaves });
});

module.exports = router;
