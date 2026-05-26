const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireRoles } = require('../middleware/auth');
const { normalizeProfilePhotoUrl } = require('../utils/profilePhoto');

const router = express.Router();

/** Admin-only managers directory. */
router.get('/', authMiddleware, requireRoles('admin'), async (_req, res) => {
  try {
    const { rows: managers } = await pool.query(
      `
      SELECT id, employeecode, name, email, department, role, profilephotourl, createdat
      FROM employees
      WHERE role = 'manager'
      ORDER BY name ASC
    `
    );

    return res.json({
      managers: managers.map((m) => ({
        id: m.id,
        employeecode: m.employeecode,
        name: m.name,
        email: m.email,
        department: m.department,
        profilePhotoUrl: normalizeProfilePhotoUrl(m.profilephotourl),
        joinDate: m.createdat,
      })),
    });
  } catch (err) {
    console.error('GET /managers:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
