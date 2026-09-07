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
  const workLogRows = [
    [
      'Employee Code',
      'Employee Email',
      'Employee Name',
      'Project',
      'Task',
      'Version',
      'Date',
      'Output Qty',
      'Actual MH',
      'Remarks',
      'Status',
    ],
    [
      'EMP001',
      '',
      '',
      'Sample Project',
      'Sample Task',
      '',
      '2026-01-15',
      10,
      4,
      'Backdated entry by employee code',
      'approved',
    ],
    [
      '',
      'employee@company.com',
      '',
      'Sample Project',
      'Sample Task',
      'V1',
      '2026-01-16',
      8,
      3.5,
      'Backdated entry by email',
      'approved',
    ],
    [
      '',
      '',
      'Jane Doe',
      'Sample Project',
      'Sample Task',
      '',
      '2026-01-17',
      5,
      2,
      '',
      'approved',
    ],
  ];

  const instructionRows = [
    ['How to upload backdated work logs'],
    [''],
    ['Required columns', 'Project, Task, Date, Output Qty, Actual MH'],
    ['Employee (pick one)', 'Employee Code OR Employee Email OR Employee Name — must match HRMS exactly'],
    ['Date format', 'YYYY-MM-DD (example: 2026-01-15)'],
    ['Status', 'approved (recommended for historical data), pending, or rejected. Defaults to approved if blank.'],
    ['Version', 'Task version label if your project setup uses versions; leave blank otherwise'],
    [''],
    ['Before you import'],
    ['1', 'Create the project and task standards under Efficiency → Projects & task standards'],
    ['2', 'Replace sample rows with real employee codes/emails, projects, tasks, and dates'],
    ['3', 'Delete the Instructions sheet before upload (optional — only the first sheet is read)'],
    ['4', 'Upload the file from Efficiency → Import backdated logs'],
    [''],
    ['Column aliases also accepted'],
    ['Employee Code', 'Emp Code, Code'],
    ['Project', 'Project Name'],
    ['Task', 'Task Name'],
    ['Date', 'Log Date'],
    ['Output Qty', 'Output, Quantity, Actual Output Qty'],
    ['Actual MH', 'Manhours, Actual Manhours, Actual Man Hours'],
  ];

  const workLogSheet = XLSX.utils.aoa_to_sheet(workLogRows);
  workLogSheet['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 11 },
    { wch: 10 },
    { wch: 28 },
    { wch: 10 },
  ];

  const instructionSheet = XLSX.utils.aoa_to_sheet(instructionRows);
  instructionSheet['!cols'] = [{ wch: 22 }, { wch: 72 }];
  instructionSheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, workLogSheet, 'WorkLogs');
  XLSX.utils.book_append_sheet(wb, instructionSheet, 'Instructions');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  parseWorkbookBuffer,
  applyWorkLogImport,
  buildWorkLogImportTemplateBuffer,
};
