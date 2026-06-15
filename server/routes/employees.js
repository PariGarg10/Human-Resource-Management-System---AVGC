const express = require('express');
const { pool } = require('../db');
const { authMiddleware, enforceForcePasswordChange } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);
router.use(enforceForcePasswordChange);

/** PATCH /api/employees/:id/first-login — dismiss first-login celebration */
router.patch('/:id/first-login', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id !== req.user.id) {
      return res.status(403).json({ message: 'You can only update your own first-login flag' });
    }
    const body = req.body || {};
    if (body.isFirstLogin !== false) {
      return res.status(400).json({ message: 'isFirstLogin must be false' });
    }
    await pool.query('UPDATE employees SET is_first_login = FALSE WHERE id = $1', [id]);
    return res.json({ isFirstLogin: false });
  } catch (err) {
    console.error('PATCH /employees/:id/first-login:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PATCH /api/employees/:id — update onboardingCompleted flag */
router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id !== req.user.id) {
      return res.status(403).json({ message: 'You can only update your own record' });
    }
    if (req.body?.onboardingCompleted === true) {
      await pool.query(`UPDATE employees SET onboarding_completed = TRUE WHERE id = $1`, [id]);
      return res.json({ onboardingCompleted: true });
    }
    if (req.body?.onboardingCompleted === false) {
      return res.status(400).json({ message: 'onboardingCompleted cannot be set to false via API' });
    }
    return res.status(400).json({ message: 'No supported fields to update' });
  } catch (err) {
    console.error('PATCH /employees/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
