const express = require('express');
const { pool } = require('../db');
const { authMiddleware, enforcePasswordChange } = require('../middleware/auth');
const { requireAdminAccess } = require('../middleware/adminAuth');
const { requirePermission, PERMISSION_MODULES } = require('../utils/adminPermissions');
const { broadcastToEmployeesAndManagers } = require('../utils/notifications');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(authMiddleware);
router.use(enforcePasswordChange);

async function birthdaysTodayRows() {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const { rows } = await pool.query(
    `
      SELECT id, name
      FROM employees
      WHERE dateofbirth IS NOT NULL
        AND char_length(trim(dateofbirth)) >= 10
        AND substring(dateofbirth from 6 for 5) = $1
      ORDER BY name ASC
    `,
    [`${mm}-${dd}`]
  );
  return rows;
}

async function notificationRows(userId) {
  const { rows } = await pool.query(
    `
      SELECT id, message, type, isread AS "isRead", createdat
      FROM notifications
      WHERE userid = $1
      ORDER BY createdat DESC
      LIMIT 100
    `,
    [userId]
  );
  return rows;
}

async function notificationResponse(userId) {
  const userResult = await pool.query('SELECT id FROM employees WHERE id = $1', [userId]);
  if (!userResult.rows[0]) return null;

  const birthdaysToday = (await birthdaysTodayRows()).map((r) => ({ id: r.id, name: r.name }));

  const notifications = (await notificationRows(userId)).map((r) => ({
    id: r.id,
    message: r.message,
    type: r.type,
    isRead: Boolean(r.isRead),
    createdAt: r.createdat,
  }));

  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.isRead).length,
    birthdaysToday,
  };
}

router.get('/', async (req, res) => {
  try {
    const payload = await notificationResponse(req.user.id);
    return res.json(payload);
  } catch (err) {
    console.error('GET /notifications:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:userId', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) return res.status(400).json({ message: 'Invalid user id' });
    if (userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: cannot read notifications for this user' });
    }

    const payload = await notificationResponse(userId);
    if (!payload) return res.status(404).json({ message: 'User not found' });
    return res.json(payload);
  } catch (err) {
    console.error('GET /notifications/:userId:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/broadcast', requireAdminAccess, requirePermission(PERMISSION_MODULES.SETTINGS), async (req, res) => {
  try {
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ message: 'Message is required' });

    const count = await broadcastToEmployeesAndManagers('broadcast', message, {
      subjectEmployeeId: req.user.id,
    });
    await logAudit(req.user.id, 'NOTIFICATION_BROADCAST_SENT', 'notifications', { count });
    return res.status(201).json({ message: 'Broadcast sent', count });
  } catch (err) {
    console.error('POST /notifications/broadcast:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const infoResult = await pool.query(
      'SELECT id FROM notifications WHERE id = $1 AND userid = $2',
      [id, req.user.id]
    );
    if (!infoResult.rows[0]) return res.status(404).json({ message: 'Notification not found' });

    await pool.query('UPDATE notifications SET isread = TRUE WHERE id = $1', [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /notifications/:id/read:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
