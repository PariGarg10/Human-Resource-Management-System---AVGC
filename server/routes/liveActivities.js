const express = require('express');
const { pool } = require('../db');
const { requireAdminOrFounder } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');

const router = express.Router();

const NOMINATION_CATEGORIES = new Set(['mvp', 'team_lead']);

let schemaReady = false;

async function ensureLiveActivitiesSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS live_activity_links (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT,
      created_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS live_activity_nominations (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL CHECK (category IN ('mvp', 'team_lead')),
      nominator_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      nominee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (category, nominator_id, nominee_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS live_activity_winners (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL CHECK (category IN ('mvp', 'team_lead')),
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      message TEXT,
      announced_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_live_activity_links_active ON live_activity_links (is_active, created_at DESC)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_live_activity_nominations_category ON live_activity_nominations (category, nominee_id)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_live_activity_winners_active ON live_activity_winners (category, is_active, created_at DESC)'
  );
  schemaReady = true;
}

function assertCategory(category) {
  const value = String(category || '').toLowerCase().trim();
  return NOMINATION_CATEGORIES.has(value) ? value : null;
}

function isManagerUser(user) {
  const role = String(user?.role || '').toLowerCase().trim();
  return role === 'manager' || role === 'admin' || role === 'founder';
}

async function notifyAllEmployees(message, type = 'live_activity') {
  const { rows } = await pool.query('SELECT id FROM employees WHERE isregistered = TRUE OR role <> $1', ['employee']);
  await Promise.all(rows.map((row) => createNotification(row.id, type, message)));
}

router.use(async (_req, res, next) => {
  try {
    await ensureLiveActivitiesSchema();
    next();
  } catch (err) {
    console.error('live activities schema:', err.message);
    res.status(500).json({ message: 'Could not prepare live activities' });
  }
});

router.get('/links', async (_req, res) => {
  const { rows } = await pool.query(
    `
      SELECT l.id, l.title, l.url, l.description, l.created_at AS "createdAt",
             e.name AS "createdBy"
      FROM live_activity_links l
      LEFT JOIN employees e ON e.id = l.created_by
      WHERE l.is_active = TRUE
      ORDER BY l.created_at DESC
      LIMIT 50
    `
  );
  res.json({ links: rows });
});

router.post('/links', requireAdminOrFounder, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const url = String(req.body?.url || '').trim();
  const description = String(req.body?.description || '').trim() || null;
  if (!title || !url) return res.status(400).json({ message: 'Title and URL are required' });
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ message: 'URL must start with http:// or https://' });

  const { rows } = await pool.query(
    `
      INSERT INTO live_activity_links (title, url, description, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id, title, url, description, created_at AS "createdAt"
    `,
    [title, url, description, req.user.id]
  );
  await notifyAllEmployees(`New live activity link: ${title}`, 'live_activity');
  res.status(201).json({ link: rows[0] });
});

router.get('/nominees', async (_req, res) => {
  const { rows } = await pool.query(
    `
      SELECT id, employeecode, name, email, department, designation, role
      FROM employees
      ORDER BY name ASC
    `
  );
  const employees = rows.map((row) => ({
    id: row.id,
    code: row.employeecode,
    name: row.name,
    email: row.email,
    department: row.department,
    designation: row.designation,
    role: row.role,
    isTeamLead: /team\s*lead|lead/i.test(String(row.designation || '')),
  }));
  res.json({ employees });
});

router.post('/nominations', async (req, res) => {
  const category = assertCategory(req.body?.category);
  const nomineeId = Number(req.body?.nomineeId);
  const reason = String(req.body?.reason || '').trim() || null;
  if (!category) return res.status(400).json({ message: 'Valid category is required' });
  if (category === 'team_lead' && !isManagerUser(req.user)) {
    return res.status(403).json({ message: 'Only managers can nominate most valuable team lead' });
  }
  if (!Number.isFinite(nomineeId) || nomineeId <= 0) {
    return res.status(400).json({ message: 'Valid nominee is required' });
  }
  const nominee = await pool.query('SELECT id FROM employees WHERE id = $1', [nomineeId]);
  if (!nominee.rows[0]) return res.status(404).json({ message: 'Nominee not found' });

  const { rows } = await pool.query(
    `
      INSERT INTO live_activity_nominations (category, nominator_id, nominee_id, reason)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (category, nominator_id, nominee_id)
      DO UPDATE SET reason = EXCLUDED.reason, created_at = NOW()
      RETURNING id, category, nominee_id AS "nomineeId", created_at AS "createdAt"
    `,
    [category, req.user.id, nomineeId, reason]
  );
  res.status(201).json({ nomination: rows[0] });
});

router.get('/winners', async (_req, res) => {
  const { rows } = await pool.query(
    `
      SELECT DISTINCT ON (w.category)
        w.id, w.category, w.message, w.created_at AS "createdAt",
        e.id AS "employeeId", e.name, e.designation, e.department
      FROM live_activity_winners w
      JOIN employees e ON e.id = w.employee_id
      WHERE w.is_active = TRUE
      ORDER BY w.category, w.created_at DESC
    `
  );
  res.json({ winners: rows });
});

router.get('/nominations/stats', requireAdminOrFounder, async (_req, res) => {
  const { rows } = await pool.query(
    `
      SELECT n.category, e.id AS "employeeId", e.name, e.designation, e.department,
             COUNT(*)::int AS votes
      FROM live_activity_nominations n
      JOIN employees e ON e.id = n.nominee_id
      GROUP BY n.category, e.id, e.name, e.designation, e.department
      ORDER BY n.category ASC, votes DESC, e.name ASC
    `
  );
  res.json({ stats: rows });
});

router.post('/winners', requireAdminOrFounder, async (req, res) => {
  const category = assertCategory(req.body?.category);
  const employeeId = Number(req.body?.employeeId);
  const message = String(req.body?.message || '').trim() || null;
  if (!category) return res.status(400).json({ message: 'Valid category is required' });
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return res.status(400).json({ message: 'Valid winner is required' });
  }
  const employee = await pool.query('SELECT id, name FROM employees WHERE id = $1', [employeeId]);
  if (!employee.rows[0]) return res.status(404).json({ message: 'Winner not found' });

  await pool.query('UPDATE live_activity_winners SET is_active = FALSE WHERE category = $1', [category]);
  const { rows } = await pool.query(
    `
      INSERT INTO live_activity_winners (category, employee_id, message, announced_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id, category, employee_id AS "employeeId", message, created_at AS "createdAt"
    `,
    [category, employeeId, message, req.user.id]
  );
  const label = category === 'mvp' ? 'MVP' : 'Most Valuable Team Lead';
  await notifyAllEmployees(`${label} winner announced: ${employee.rows[0].name}`, 'live_activity_winner');
  res.status(201).json({ winner: rows[0] });
});

module.exports = router;
