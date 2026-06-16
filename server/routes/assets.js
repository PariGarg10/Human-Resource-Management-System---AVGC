const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { pool } = require('../db');
const { authMiddleware, enforceForcePasswordChange, requireRoles, isFounderUser } = require('../middleware/auth');
const { ROLES, isAdminRole, isManagerRole, normalizeRole } = require('../constants/roles');
const { formatDisplayDate } = require('../utils/formatDate');

const router = express.Router();
const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(authMiddleware);
router.use(enforceForcePasswordChange);

function normalizeImportHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAssetImportBuffer(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  const headerIndex = matrix.findIndex((row) => row.some((cell) => String(cell || '').trim()));
  if (headerIndex === -1) {
    throw new Error('Uploaded file is empty');
  }

  const headerAliases = {
    deviceType: ['device type', 'device', 'item name', 'name'],
    category: ['category', 'device category', 'type'],
    modelNumber: ['model number', 'model no', 'model'],
    serialNumber: ['serial number', 'serial no', 'serial'],
    quantity: ['quantity', 'qty', 'count', 'total count'],
    assignedTo: ['assigned to', 'employee code', 'employee', 'assigned employee'],
  };

  const headers = matrix[headerIndex].map(normalizeImportHeader);
  const columnIndex = {};
  for (const [field, aliases] of Object.entries(headerAliases)) {
    const aliasSet = new Set(aliases.map(normalizeImportHeader));
    const idx = headers.findIndex((header) => aliasSet.has(header));
    if (idx !== -1) columnIndex[field] = idx;
  }

  const required = ['deviceType', 'modelNumber', 'serialNumber', 'quantity'];
  const missing = required.filter((field) => columnIndex[field] == null);
  if (missing.length > 0) {
    throw new Error(`Missing required column(s): ${missing.join(', ')}`);
  }

  return matrix
    .slice(headerIndex + 1)
    .map((row, index) => ({
      rowNumber: headerIndex + index + 2,
      deviceType: String(row[columnIndex.deviceType] || '').trim(),
      category: columnIndex.category != null ? String(row[columnIndex.category] || '').trim() : '',
      modelNumber: String(row[columnIndex.modelNumber] || '').trim(),
      serialNumber: String(row[columnIndex.serialNumber] || '').trim(),
      quantity: Number(row[columnIndex.quantity]),
      assignedTo:
        columnIndex.assignedTo != null ? String(row[columnIndex.assignedTo] || '').trim() : '',
    }))
    .filter((row) => row.deviceType || row.modelNumber || row.serialNumber || row.quantity || row.assignedTo);
}

async function inventoryWithCounts() {
  const result = await pool.query(`
    SELECT
      i.id,
      i.name,
      i.category,
      i.model_number AS "modelNumber",
      i.serial_number AS "serialNumber",
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
      i.category AS "itemCategory",
      COALESCE(al.model_number, i.model_number) AS "modelNumber",
      COALESCE(al.serial_number, i.serial_number) AS "serialNumber"
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

function canViewAssetInventory(user) {
  if (!user) return false;
  if (user.adminId) return true;
  const role = normalizeRole(user.role);
  return isAdminRole(role) || isManagerRole(role) || isFounderUser(user);
}

function canManageAssets(user) {
  if (!user) return false;
  if (user.adminId) return true;
  const role = normalizeRole(user.role);
  return isAdminRole(role) || isFounderUser(user);
}

/** GET inventory — admin & manager read; employee forbidden */
router.get('/inventory', async (req, res) => {
  try {
    if (!canViewAssetInventory(req.user)) {
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
    if (!canViewAssetInventory(req.user)) {
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
          i.category AS "itemCategory",
          COALESCE(al.model_number, i.model_number) AS "modelNumber",
          COALESCE(al.serial_number, i.serial_number) AS "serialNumber"
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
    const modelNumber = req.body?.modelNumber != null ? String(req.body.modelNumber).trim() : null;
    const serialNumber = req.body?.serialNumber != null ? String(req.body.serialNumber).trim() : null;
    const totalCount = Number(req.body?.totalCount ?? req.body?.total_count);
    if (!name || !category) {
      return res.status(400).json({ message: 'Name and category are required' });
    }
    if (!Number.isFinite(totalCount) || totalCount < 0) {
      return res.status(400).json({ message: 'totalCount must be a non-negative number' });
    }
    const inserted = await pool.query(
      `
        INSERT INTO inventory_items (name, category, model_number, serial_number, total_count)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, category, model_number AS "modelNumber", serial_number AS "serialNumber", total_count AS "totalCount"
      `,
      [name, category, modelNumber || null, serialNumber || null, Math.floor(totalCount)]
    );
    return res.status(201).json({ item: inserted.rows[0], message: 'Inventory item added' });
  } catch (err) {
    console.error('POST /assets/inventory:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** POST inventory import (Excel) — admin only */
router.post(
  '/inventory/import',
  requireRoles(ROLES.ADMIN, ROLES.FOUNDER, ROLES.IT_HEAD),
  (req, res, next) => {
    assetUpload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          message: err.message || 'File upload failed. Use .xls/.xlsx/.csv under 10 MB.',
        });
      }
      return next();
    });
  },
  async (req, res) => {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ message: 'Asset Excel file is required' });
    }

    try {
      const rows = parseAssetImportBuffer(req.file.buffer);
      const summary = {
        totalrows: rows.length,
        successfulimports: 0,
        allocated: 0,
        failedrows: 0,
        errors: [],
      };

      for (const row of rows) {
        try {
          if (!row.deviceType || !row.modelNumber || !row.serialNumber || !Number.isFinite(row.quantity) || row.quantity < 1) {
            throw new Error('Device Type, Model Number, Serial Number, and Quantity (>=1) are required');
          }

          const category = row.category || 'General';
          const quantity = Math.floor(row.quantity);
          const inserted = await pool.query(
            `
              INSERT INTO inventory_items (name, category, model_number, serial_number, total_count)
              VALUES ($1, $2, $3, $4, $5)
              RETURNING id
            `,
            [row.deviceType, category, row.modelNumber, row.serialNumber, quantity]
          );

          if (row.assignedTo) {
            const empRes = await pool.query(
              'SELECT id FROM employees WHERE employeecode = $1 OR lower(trim(name)) = lower($2) LIMIT 1',
              [row.assignedTo, row.assignedTo]
            );
            if (empRes.rows[0]) {
              await pool.query(
                `
                  INSERT INTO asset_allocations (inventory_item_id, employee_id, model_number, serial_number, allocated_at, status)
                  VALUES ($1, $2, $3, $4, NOW(), 'active')
                `,
                [inserted.rows[0].id, empRes.rows[0].id, row.modelNumber, row.serialNumber]
              );
              summary.allocated += 1;
            }
          }

          summary.successfulimports += 1;
        } catch (error) {
          summary.failedrows += 1;
          summary.errors.push({ row: row.rowNumber, error: error.message || 'Invalid row' });
        }
      }

      return res.json(summary);
    } catch (err) {
      return res.status(400).json({ message: err.message || 'Unable to parse asset import file' });
    }
  }
);

/** PATCH inventory item — admin only */
router.patch('/inventory/:id', requireRoles(ROLES.ADMIN, ROLES.FOUNDER, ROLES.IT_HEAD), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const existing = await pool.query(
      'SELECT id, name, category, model_number, serial_number, total_count FROM inventory_items WHERE id = $1',
      [id]
    );
    if (!existing.rows[0]) return res.status(404).json({ message: 'Item not found' });
    const row = existing.rows[0];

    const name =
      req.body?.name != null ? String(req.body.name).trim() : row.name;
    const category =
      req.body?.category != null ? String(req.body.category).trim() : row.category;
    const modelNumber =
      req.body?.modelNumber != null ? String(req.body.modelNumber).trim() : row.model_number;
    const serialNumber =
      req.body?.serialNumber != null ? String(req.body.serialNumber).trim() : row.serial_number;
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
        SET name = $1, category = $2, model_number = $3, serial_number = $4, total_count = $5, updated_at = NOW()
        WHERE id = $6
        RETURNING id
      `,
      [name, category, modelNumber || null, serialNumber || null, Math.floor(totalCount), id]
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
    const modelNumberInput = req.body?.modelNumber != null ? String(req.body.modelNumber).trim() : '';
    const serialNumberInput = req.body?.serialNumber != null ? String(req.body.serialNumber).trim() : '';
    const allocatedAt = req.body?.allocatedAt || req.body?.allocated_at || new Date().toISOString();

    if (!Number.isFinite(inventoryItemId) || !Number.isFinite(employeeId)) {
      return res.status(400).json({ message: 'inventoryItemId and employeeId are required' });
    }

    const itemRes = await pool.query(
      'SELECT id, total_count, model_number, serial_number FROM inventory_items WHERE id = $1',
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

    const modelNumber = modelNumberInput || itemRes.rows[0].model_number || null;
    const serialNumber = serialNumberInput || itemRes.rows[0].serial_number || null;

    const ins = await pool.query(
      `
        INSERT INTO asset_allocations (inventory_item_id, employee_id, model_number, serial_number, allocated_at, notes, status)
        VALUES ($1, $2, $3, $4, $5::timestamptz, $6, 'active')
        RETURNING id
      `,
      [inventoryItemId, employeeId, modelNumber, serialNumber, allocatedAt, notes]
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

/** Employee list for allocate dropdown — admin / founder */
router.get('/employees-options', async (req, res) => {
  try {
    if (!canManageAssets(req.user)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
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
