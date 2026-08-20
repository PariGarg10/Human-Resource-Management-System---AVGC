const XLSX = require('xlsx');
const { pool } = require('../db');

const HEADER_ALIASES = {
  employeeCode: ['employee code', 'employeecode', 'emp code', 'code'],
  employeeEmail: ['employee email', 'email'],
  employeeName: ['employee name', 'employee', 'name'],
  projectName: ['project', 'project name'],
  taskName: ['task', 'task name'],
  versionLabel: ['version', 'version label'],
  logDate: ['date', 'log date', 'log_date'],
  actualOutputQty: ['output qty', 'output', 'quantity', 'actual output qty', 'actual_output_qty'],
  actualManhoursSpent: ['actual mh', 'manhours', 'actual manhours', 'actual_manhours_spent', 'actual man hours'],
  remarks: ['remarks', 'notes'],
  status: ['status'],
};

function normHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function mapHeaders(row) {
  const keys = Object.keys(row);
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const key of keys) {
      const n = normHeader(key);
      if (aliases.includes(n) || n === field.toLowerCase()) {
        map[field] = key;
        break;
      }
    }
  }
  return map;
}

function cell(row, map, field) {
  const key = map[field];
  if (!key) return '';
  return row[key];
}

function parseWorkbookBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (!rows.length) throw new Error('Excel sheet is empty');
  const headerMap = mapHeaders(rows[0]);
  const required = ['projectName', 'taskName', 'logDate', 'actualOutputQty', 'actualManhoursSpent'];
  for (const field of required) {
    if (!headerMap[field]) {
      throw new Error(`Missing required column: ${field}`);
    }
  }
  return rows.map((row, idx) => ({
    rowNum: idx + 2,
    employeeCode: String(cell(row, headerMap, 'employeeCode') || '').trim(),
    employeeEmail: String(cell(row, headerMap, 'employeeEmail') || '').trim().toLowerCase(),
    employeeName: String(cell(row, headerMap, 'employeeName') || '').trim(),
    projectName: String(cell(row, headerMap, 'projectName') || '').trim(),
    taskName: String(cell(row, headerMap, 'taskName') || '').trim(),
    versionLabel: String(cell(row, headerMap, 'versionLabel') || '').trim(),
    logDate: String(cell(row, headerMap, 'logDate') || '').trim().slice(0, 10),
    actualOutputQty: Number(cell(row, headerMap, 'actualOutputQty')),
    actualManhoursSpent: Number(cell(row, headerMap, 'actualManhoursSpent')),
    remarks: String(cell(row, headerMap, 'remarks') || '').trim() || null,
    status: String(cell(row, headerMap, 'status') || 'approved').trim().toLowerCase(),
  }));
}

async function resolveEmployee(row) {
  if (row.employeeCode) {
    const { rows } = await pool.query(
      'SELECT id, name FROM employees WHERE LOWER(employeecode) = LOWER($1) LIMIT 1',
      [row.employeeCode]
    );
    if (rows[0]) return rows[0];
  }
  if (row.employeeEmail) {
    const { rows } = await pool.query(
      'SELECT id, name FROM employees WHERE LOWER(email) = $1 LIMIT 1',
      [row.employeeEmail]
    );
    if (rows[0]) return rows[0];
  }
  if (row.employeeName) {
    const { rows } = await pool.query(
      'SELECT id, name FROM employees WHERE LOWER(name) = LOWER($1) LIMIT 1',
      [row.employeeName]
    );
    if (rows[0]) return rows[0];
  }
  return null;
}

async function applyWorkLogImport(rows, { importedBy }) {
  let inserted = 0;
  const errors = [];

  for (const row of rows) {
    try {
      if (!row.projectName || !row.taskName || !/^\d{4}-\d{2}-\d{2}$/.test(row.logDate)) {
        throw new Error('Invalid project, task, or date');
      }
      if (!Number.isFinite(row.actualOutputQty) || row.actualOutputQty <= 0) {
        throw new Error('Output qty must be > 0');
      }
      if (!Number.isFinite(row.actualManhoursSpent) || row.actualManhoursSpent <= 0) {
        throw new Error('Actual manhours must be > 0');
      }

      const employee = await resolveEmployee(row);
      if (!employee) throw new Error('Employee not found');

      const proj = await pool.query(
        `INSERT INTO efficiency_projects (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [row.projectName]
      );
      const projectId = proj.rows[0].id;

      const baseline = await pool.query(
        `
          SELECT id, manhours_per_unit FROM task_baselines
          WHERE project_id = $1 AND task_name = $2 AND version_label = $3
          LIMIT 1
        `,
        [projectId, row.taskName, row.versionLabel || '']
      );
      if (!baseline.rows[0]) {
        throw new Error('Task baseline not found — create task standard first or include full baseline in project setup');
      }

      const status = ['pending', 'approved', 'rejected'].includes(row.status) ? row.status : 'approved';
      const rate = Number(baseline.rows[0].manhours_per_unit);
      const impliedMhs = status === 'approved' ? row.actualOutputQty * rate : null;

      const mgr = await pool.query(
        'SELECT managerid FROM manageremployees WHERE employeeid = $1 LIMIT 1',
        [employee.id]
      );
      let managerId = mgr.rows[0]?.managerid || null;
      if (!managerId) {
        const emp = await pool.query('SELECT reporting_to_id FROM employees WHERE id = $1', [employee.id]);
        managerId = emp.rows[0]?.reporting_to_id || importedBy || null;
      }

      await pool.query(
        `
          INSERT INTO work_logs (
            employee_id, project_id, task_baseline_id, log_date, employee_name,
            actual_output_qty, actual_manhours_spent, remarks, status, manager_id,
            implied_mhs, approved_at
          )
          VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11,
            CASE WHEN $9 = 'approved' THEN NOW() ELSE NULL END)
        `,
        [
          employee.id,
          projectId,
          baseline.rows[0].id,
          row.logDate,
          employee.name,
          row.actualOutputQty,
          row.actualManhoursSpent,
          row.remarks,
          status,
          managerId,
          impliedMhs,
        ]
      );
      inserted += 1;
    } catch (err) {
      errors.push({ row: row.rowNum, message: err.message || 'Import failed' });
    }
  }

  return { inserted, errors, total: rows.length };
}

function buildWorkLogImportTemplateBuffer() {
  const rows = [
    {
      'Employee Code': 'E001',
      'Employee Email': '',
      'Employee Name': '',
      Project: 'Sample Project',
      Task: 'Sample Task',
      Version: '',
      Date: '2026-01-15',
      'Output Qty': 10,
      'Actual MH': 4,
      Remarks: '',
      Status: 'approved',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'WorkLogs');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  parseWorkbookBuffer,
  applyWorkLogImport,
  buildWorkLogImportTemplateBuffer,
};
