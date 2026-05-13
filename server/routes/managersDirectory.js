const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

/** Any authenticated user may view the managers directory (including before mandatory password change). */
router.get('/', authMiddleware, (_req, res) => {
  const managers = db
    .prepare(
      `
      SELECT id, employeecode, name, email, department, role, profilephotourl, createdat
      FROM employees
      WHERE role = 'manager'
      ORDER BY name ASC
    `
    )
    .all();

  return res.json({
    managers: managers.map((m) => ({
      id: m.id,
      employeecode: m.employeecode,
      name: m.name,
      email: m.email,
      department: m.department,
      profilePhotoUrl: m.profilephotourl || null,
      joinDate: m.createdat,
    })),
  });
});

module.exports = router;
