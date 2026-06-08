const express = require('express');
const { pool } = require('../db');
const { authMiddleware, enforceForcePasswordChange, requireRoles } = require('../middleware/auth');
const { ROLES, isAdminRole } = require('../constants/roles');
const { formatDisplayDate } = require('../utils/formatDate');

const router = express.Router();

router.use(authMiddleware);
router.use(enforceForcePasswordChange);

async function inventoryWithCounts() {
  const result = await pool.query(`
    SELECT
      i.id,
      i.name,
      i.category,
      i.total_count AS "totalCount",
      i.created_at AS "createdAt",
      i.updated_at AS "updatedAt",
      COALESCE(a.cnt, 0)::int AS "allocatedCount",
      GREATEST(i.total_count - COALESCE(a.cnt, 0), 0)::int AS "availableCount"
    FROM inventory_items i
    LEFT JOIN (
      SELECT inventory_item_id, COUNT(*)::int AS cnt
      FROM asset_allocations
      WHERE status = 'active'
      GROUP BY inventory_item_id
    ) a ON a.inventory_item_id = i.id
    ORDER BY i.name ASC
  `);
  return result.rows;
}

async function listAllocations() {
  const result = await pool.query(`
    SELECT
      al.id,
      al.inventory_item_id AS "inventoryItemId",
      al.employee_id AS "employeeId",
      al.allocated_at AS "allocatedAt",
      al.notes,
      al.status,
      e.name AS "employeeName",
      e.employeecode AS "employeeCode",
      i.name AS "itemName",
      i.category AS "itemCategory"
    FROM asset_allocations al
    JOIN employees e ON e.id = al.employee_id
    JOIN inventory_items i ON i.id = al.inventory_item_id
    ORDER BY al.allocated_at DESC
  `);
  return result.rows.map((row) => ({
    ...row,
    allocatedAtFormatted: formatDisplayDate(row.allocatedAt),
  }));
}

/** GET inventory — admin & manager read; employee forbidden */
router.get('/inventory', async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (role === ROLES.EMPLOYEE) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const items = await inventoryWithCounts();
    return res.json({ items });
  } catch (err) {
    console.error('GET /assets/inventory:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** GET all allocations — admin & manager */
router.get('/allocations', async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (role === ROLES.EMPLOYEE) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const allocations = await listAllocations();
    return res.json({ allocations });
  } catch (err) {
    console.error('GET /assets/allocations:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** GET own allocations — employee (and any user for self) */
router.get('/my-allocations', async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          al.id,
          al.allocated_at AS "allocatedAt",
          al.notes,
          al.status,
          i.name AS "itemName",
          i.category AS "itemCategory"
        FROM asset_allocations al
        JOIN inventory_items i ON i.id = al.inventory_item_id
        WHERE al.employee_id = $1
        ORDER BY al.allocated_at DESC
      `,
      [req.user.id]
    );
    const allocations = result.rows.map((row) => ({
      ...row,
      allocatedAtFormatted: formatDisplayDate(row.allocatedAt),
    }));
    return res.json({ allocations });
  } catch (err) {
    console.error('GET /assets/my-allocations:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST inventory item — admin only */
router.post('/inventory', requireRoles(ROLES.ADMIN, ROLES.FOUNDER, ROLES.IT_HEAD), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const category = String(req.body?.category || '').trim();
    const totalCount = Number(req.body?.totalCount ?? req.body?.total_count);
    if (!name || !category) {
      return res.status(400).json({ message: 'Name and category are required' });
    }
    if (!Number.isFinite(totalCount) || totalCount < 0) {
      return res.status(400).json({ message: 'totalCount must be a non-negative number' });
    }
    const inserted = await pool.query(
      `
        INSERT INTO inventory_items (name, category, total_count)
        VALUES ($1, $2, $3)
        RETURNING id, name, category, total_count AS "totalCount"
      `,
      [name, category, Math.floor(totalCount)]
    );
    return res.status(201).json({ item: inserted.rows[0], message: 'Inventory item added' });
  } catch (err) {
    console.error('POST /assets/inventory:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PATCH inventory item — admin only */
router.patch('/inventory/:id', requireRoles(ROLES.ADMIN, ROLES.FOUNDER, ROLES.IT_HEAD), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const existing = await pool.query(
      'SELECT id, name, category, total_count FROM inventory_items WHERE id = $1',
      [id]
    );
    if (!existing.rows[0]) return res.status(404).json({ message: 'Item not found' });
    const row = existing.rows[0];

    const name =
      req.body?.name != null ? String(req.body.name).trim() : row.name;
    const category =
      req.body?.category != null ? String(req.body.category).trim() : row.category;
    const totalCountRaw = req.body?.totalCount ?? req.body?.total_count;
    const totalCount =
      totalCountRaw != null ? Number(totalCountRaw) : Number(row.total_count);

    if (!name || !category) {
      return res.status(400).json({ message: 'Name and category are required' });
    }
    if (!Number.isFinite(totalCount) || totalCount < 0) {
      return res.status(400).json({ message: 'totalCount must be a non-negative number' });
    }

    const active = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM asset_allocations WHERE inventory_item_id = $1 AND status = 'active'`,
      [id]
    );
    const allocated = active.rows[0]?.cnt || 0;
    if (totalCount < allocated) {
      return res.status(400).json({
        message: `totalCount cannot be less than active allocations (${allocated})`,
      });
    }

    const updated = await pool.query(
      `
        UPDATE inventory_items
        SET name = $1, category = $2, total_count = $3, updated_at = NOW()
        WHERE id = $4
        RETURNING id
      `,
      [name, category, Math.floor(totalCount), id]
    );
    if (!updated.rows[0]) return res.status(404).json({ message: 'Item not found' });
    return res.json({ message: 'Inventory updated' });
  } catch (err) {
    console.error('PATCH /assets/inventory/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** DELETE inventory — admin only */
router.delete('/inventory/:id', requireRoles(ROLES.ADMIN, ROLES.FOUNDER, ROLES.IT_HEAD), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
    const active = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM asset_allocations WHERE inventory_item_id = $1 AND status = 'active'`,
      [id]
    );
    if ((active.rows[0]?.cnt || 0) > 0) {
      return res.status(400).json({ message: 'Cannot delete item with active allocations' });
    }
    const del = await pool.query('DELETE FROM inventory_items WHERE id = $1 RETURNING id', [id]);
    if (!del.rows[0]) return res.status(404).json({ message: 'Item not found' });
    return res.json({ message: 'Inventory item deleted' });
  } catch (err) {
    console.error('DELETE /assets/inventory/:id:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST allocate — admin only */
router.post('/allocations', requireRoles(ROLES.ADMIN, ROLES.FOUNDER, ROLES.IT_HEAD), async (req, res) => {
  try {
    const inventoryItemId = Number(req.body?.inventoryItemId ?? req.body?.inventory_item_id);
    const employeeId = Number(req.body?.employeeId ?? req.body?.employee_id);
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;
    const allocatedAt = req.body?.allocatedAt || req.body?.allocated_at || new Date().toISOString();

    if (!Number.isFinite(inventoryItemId) || !Number.isFinite(employeeId)) {
      return res.status(400).json({ message: 'inventoryItemId and employeeId are required' });
    }

    const itemRes = await pool.query(
      'SELECT id, total_count FROM inventory_items WHERE id = $1',
      [inventoryItemId]
    );
    if (!itemRes.rows[0]) return res.status(404).json({ message: 'Inventory item not found' });

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM asset_allocations WHERE inventory_item_id = $1 AND status = 'active'`,
      [inventoryItemId]
    );
    const allocated = countRes.rows[0]?.cnt || 0;
    if (allocated >= itemRes.rows[0].total_count) {
      return res.status(400).json({ message: 'No available units for this item' });
    }

    const empRes = await pool.query('SELECT id FROM employees WHERE id = $1', [employeeId]);
    if (!empRes.rows[0]) return res.status(404).json({ message: 'Employee not found' });

    const ins = await pool.query(
      `
        INSERT INTO asset_allocations (inventory_item_id, employee_id, allocated_at, notes, status)
        VALUES ($1, $2, $3::timestamptz, $4, 'active')
        RETURNING id
      `,
      [inventoryItemId, employeeId, allocatedAt, notes]
    );
    return res.status(201).json({ id: ins.rows[0].id, message: 'Asset allocated' });
  } catch (err) {
    console.error('POST /assets/allocations:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** PATCH revoke allocation — admin only */
router.patch('/allocations/:id/revoke', requireRoles(ROLES.ADMIN, ROLES.FOUNDER, ROLES.IT_HEAD), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
    const updated = await pool.query(
      `
        UPDATE asset_allocations
        SET status = 'returned', updated_at = NOW()
        WHERE id = $1 AND status = 'active'
        RETURNING id
      `,
      [id]
    );
    if (!updated.rows[0]) {
      return res.status(404).json({ message: 'Active allocation not found' });
    }
    return res.json({ message: 'Allocation returned' });
  } catch (err) {
    console.error('PATCH /assets/allocations/:id/revoke:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** Employee list for allocate dropdown — admin */
router.get('/employees-options', requireRoles(ROLES.ADMIN, ROLES.FOUNDER, ROLES.IT_HEAD), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, employeecode, department FROM employees WHERE isregistered = TRUE ORDER BY name ASC`
    );
    return res.json({ employees: result.rows });
  } catch (err) {
    console.error('GET /assets/employees-options:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
