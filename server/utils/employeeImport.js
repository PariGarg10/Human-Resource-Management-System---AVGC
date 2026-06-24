const XLSX = require('xlsx');

const EMPLOYEE_IMPORT_HEADERS = {
  name: ['name', 'employee name', 'full name', 'emp name', 'staff name'],
  email: ['email', 'email address', 'e mail', 'mail', 'work email'],
  password: ['password', 'pwd', 'pass', 'initial password', 'login password'],
  designation: ['designation', 'title', 'job title', 'position'],
  dateOfJoining: [
    'date of joining',
    'date of join',
    'joining date',
    'join date',
    'doj',
    'date joined',
  ],
  portalRole: ['portal role', 'portal_role', 'role', 'user role', 'employee type'],
  // Legacy optional columns (still accepted)
  employeecode: [
    'emp code',
    'employee code',
    'empcode',
    'employee id',
    'emp id',
    'code',
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

function parseJoiningDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmY = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmY) {
    const day = dmY[1].padStart(2, '0');
    const month = dmY[2].padStart(2, '0');
    return `${dmY[3]}-${month}-${day}`;
  }
  return null;
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

  const required = ['name', 'email', 'password', 'designation', 'dateOfJoining', 'portalRole'];
  const missing = required.filter((field) => columnIndex[field] == null);
  if (missing.length > 0) {
    const labels = {
      name: 'Name',
      email: 'Email',
      password: 'Password',
      designation: 'Designation',
      dateOfJoining: 'Date of joining',
      portalRole: 'Portal role',
    };
    throw new Error(`Missing required column(s): ${missing.map((f) => labels[f] || f).join(', ')}`);
  }

  const rows = matrix
    .slice(headerIndex + 1)
    .map((row, index) => ({
      rowNumber: headerIndex + index + 2,
      name: String(row[columnIndex.name] || '').trim(),
      email: String(row[columnIndex.email] || '')
        .trim()
        .toLowerCase(),
      password: String(row[columnIndex.password] || '').trim(),
      designation:
        columnIndex.designation != null ? String(row[columnIndex.designation] || '').trim() || null : null,
      dateOfJoining:
        columnIndex.dateOfJoining != null ? parseJoiningDate(row[columnIndex.dateOfJoining]) : null,
      dateOfJoiningInvalid:
        columnIndex.dateOfJoining != null &&
        String(row[columnIndex.dateOfJoining] || '').trim() !== '' &&
        parseJoiningDate(row[columnIndex.dateOfJoining]) == null,
      portalRole: String(row[columnIndex.portalRole] || '').trim().toLowerCase(),
      employeecode:
        columnIndex.employeecode != null ? String(row[columnIndex.employeecode] || '').trim() : '',
      department:
        columnIndex.department != null ? String(row[columnIndex.department] || '').trim() || null : null,
    }))
    .filter(
      (row) =>
        row.name ||
        row.email ||
        row.password ||
        row.designation ||
        row.portalRole ||
        row.employeecode
    );

  return {
    rows,
    mappedFields: {
      name: matrix[headerIndex][columnIndex.name],
      email: matrix[headerIndex][columnIndex.email],
      password: matrix[headerIndex][columnIndex.password],
      designation: columnIndex.designation != null ? matrix[headerIndex][columnIndex.designation] : null,
      dateOfJoining:
        columnIndex.dateOfJoining != null ? matrix[headerIndex][columnIndex.dateOfJoining] : null,
      portalRole: matrix[headerIndex][columnIndex.portalRole],
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

    const role = normalizeImportedRole(row.portalRole);
    const issues = [];
    if (!row.name) issues.push('Name is required');
    if (!row.email) issues.push('Email is required');
    if (!row.password) issues.push('Password is required');
    if (!row.portalRole) issues.push('Portal role is required');
    if (row.dateOfJoiningInvalid) {
      issues.push('Date of joining must be DD/MM/YYYY or YYYY-MM-DD');
    }

    let status = 'new';
    if (issues.length) {
      status = 'invalid';
      invalidCount += 1;
    } else {
      const byEmail = await pool.query('SELECT id, name FROM employees WHERE email = $1', [row.email]);
      if (byEmail.rows[0]) {
        status = 'exists';
        existingCount += 1;
        if (row.employeecode) {
          const byCode = await pool.query('SELECT id FROM employees WHERE employeecode = $1', [row.employeecode]);
          if (byCode.rows[0] && byCode.rows[0].id !== byEmail.rows[0].id) {
            issues.push('Employee code belongs to another person');
            status = 'invalid';
            existingCount -= 1;
            invalidCount += 1;
          }
        }
      } else if (row.employeecode) {
        const byCode = await pool.query('SELECT id FROM employees WHERE employeecode = $1', [row.employeecode]);
        if (byCode.rows[0]) {
          issues.push('Employee code already used');
          status = 'invalid';
          invalidCount += 1;
        } else {
          newCount += 1;
        }
      } else {
        newCount += 1;
      }
    }

    preview.push({
      ...row,
      role,
      employeecode: row.employeecode || '(auto)',
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
  parseJoiningDate,
};
