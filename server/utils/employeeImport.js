const XLSX = require('xlsx');

const EMPLOYEE_IMPORT_HEADERS = {
  name: ['name', 'employee name', 'full name', 'emp name', 'staff name'],
  email: ['email', 'email address', 'e mail', 'mail', 'work email'],
  role: ['role', 'designation', 'position', 'user role', 'employee type'],
  employeecode: [
    'emp code',
    'employee code',
    'empcode',
    'employee id',
    'emp id',
    'code',
    'id',
    'staff id',
  ],
  department: ['department', 'dept', 'division'],
};

function normalizeImportHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseEmployeeImportFile(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  const headerIndex = matrix.findIndex((row) => row.some((cell) => String(cell || '').trim()));
  if (headerIndex === -1) {
    throw new Error('Uploaded file is empty');
  }

  const headers = matrix[headerIndex].map(normalizeImportHeader);
  const columnIndex = {};
  for (const [field, aliases] of Object.entries(EMPLOYEE_IMPORT_HEADERS)) {
    const aliasSet = new Set(aliases.map(normalizeImportHeader));
    const idx = headers.findIndex((header) => aliasSet.has(header));
    if (idx !== -1) columnIndex[field] = idx;
  }

  const required = ['name', 'email', 'employeecode'];
  const missing = required.filter((field) => columnIndex[field] == null);
  if (missing.length > 0) {
    throw new Error(
      `Missing required column(s): ${missing.map((f) => (f === 'employeecode' ? 'Employee Code' : f.charAt(0).toUpperCase() + f.slice(1))).join(', ')}`
    );
  }

  const rows = matrix
    .slice(headerIndex + 1)
    .map((row, index) => ({
      rowNumber: headerIndex + index + 2,
      name: String(row[columnIndex.name] || '').trim(),
      email: String(row[columnIndex.email] || '')
        .trim()
        .toLowerCase(),
      role: String(row[columnIndex.role] || '').trim().toLowerCase(),
      employeecode: String(row[columnIndex.employeecode] || '').trim(),
      department:
        columnIndex.department != null ? String(row[columnIndex.department] || '').trim() || null : null,
    }))
    .filter((row) => row.name || row.email || row.employeecode);

  return {
    rows,
    mappedFields: {
      name: matrix[headerIndex][columnIndex.name],
      email: matrix[headerIndex][columnIndex.email],
      role: matrix[headerIndex][columnIndex.role],
      employeecode: matrix[headerIndex][columnIndex.employeecode],
    },
  };
}

function normalizeImportedRole(role) {
  const value = String(role || '')
    .trim()
    .toLowerCase();
  if (!value) return 'employee';
  if (['employee', 'emp', 'staff'].includes(value)) return 'employee';
  if (['manager', 'mgr'].includes(value)) return 'manager';
  if (['admin', 'administrator'].includes(value)) return 'admin';
  if (['it head', 'it_head', 'it-head', 'information technology head'].includes(value)) return 'it_head';
  return ['employee', 'manager', 'admin', 'it_head'].includes(value) ? value : 'employee';
}

function isJunkRow(row) {
  const name = String(row.name || '').trim();
  const email = String(row.email || '').trim();
  if (!name && !email) return true;
  const lower = name.toLowerCase();
  if (['total', 'grand total', 'summary', ''].includes(lower)) return true;
  return false;
}

async function validateEmployeeRows(pool, rows) {
  const preview = [];
  let newCount = 0;
  let existingCount = 0;
  let invalidCount = 0;

  for (const row of rows) {
    if (isJunkRow(row)) continue;

    const role = normalizeImportedRole(row.role);
    const issues = [];
    if (!row.name) issues.push('Name is required');
    if (!row.email) issues.push('Email is required');
    if (!row.employeecode) issues.push('Employee Code is required (or enable auto-generate on import)');

    let status = 'new';
    if (issues.length) {
      status = 'invalid';
      invalidCount += 1;
    } else {
      const byEmail = await pool.query('SELECT id, name FROM employees WHERE email = $1', [row.email]);
      const byCode = await pool.query('SELECT id FROM employees WHERE employeecode = $1', [row.employeecode]);
      if (byEmail.rows[0]) {
        status = 'exists';
        existingCount += 1;
        if (byCode.rows[0] && byCode.rows[0].id !== byEmail.rows[0].id) {
          issues.push('Email exists but employee code belongs to someone else');
          status = 'invalid';
          existingCount -= 1;
          invalidCount += 1;
        }
      } else if (byCode.rows[0]) {
        issues.push('Employee code already used');
        status = 'invalid';
        invalidCount += 1;
      } else {
        newCount += 1;
      }
    }

    preview.push({
      ...row,
      role,
      status,
      issues: issues.join('; '),
    });
  }

  return { preview, newCount, existingCount, invalidCount };
}

module.exports = {
  parseEmployeeImportFile,
  normalizeImportedRole,
  isJunkRow,
  validateEmployeeRows,
};
