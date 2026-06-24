const XLSX = require('xlsx');

const IMPORT_HEADERS = {
  employeecode: [
    'emp code',
    'employee code',
    'empcode',
    'employeecode',
    'employee id',
    'emp id',
    'emp no',
    'employee no',
    'staff id',
    'staff code',
    'code',
  ],
  name: ['name', 'employee name', 'full name', 'emp name', 'staff name'],
  reportingManager: [
    'reporting manager',
    'reporting manager code',
    'reporting manager emp code',
    'manager code',
    'manager emp code',
    'manager id',
    'mgr code',
    'reporting to',
    'reporting to code',
    'reports to',
    'manager',
  ],
};

function normalizeImportHeader(value) {
  return String(value || '')
    .replace(/^\ufeff/, '')
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headerAliasSet(field) {
  return new Set(IMPORT_HEADERS[field].map(normalizeImportHeader));
}

function scoreHeaderRow(row) {
  const headers = row.map(normalizeImportHeader);
  let hasEmp = false;
  let hasMgr = false;
  let score = 0;
  for (const h of headers) {
    if (!h) continue;
    if (headerAliasSet('employeecode').has(h)) {
      hasEmp = true;
      score += 10;
    }
    if (headerAliasSet('reportingManager').has(h)) {
      hasMgr = true;
      score += 10;
    }
    if (headerAliasSet('name').has(h)) score += 1;
  }
  if (!hasEmp || !hasMgr) return 0;
  return score + headers.filter(Boolean).length * 0.1;
}

function findHeaderRowIndex(matrix) {
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const row = matrix[i];
    if (!row || !row.some((cell) => String(cell ?? '').trim())) continue;
    const score = scoreHeaderRow(row);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx !== -1) return bestIdx;
  return matrix.findIndex((row) => row.some((cell) => String(cell ?? '').trim()));
}

function cellToImportString(cell) {
  if (cell == null || cell === '') return '';
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return cell.toISOString().slice(0, 10);
  }
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    if (Number.isInteger(cell)) return String(Math.trunc(cell));
    return String(cell);
  }
  return String(cell).trim();
}

function normalizeEmpCode(value) {
  const s = cellToImportString(value);
  return s || '';
}

function normalizePersonName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function canBeReportingManager(role) {
  const r = String(role || '').toLowerCase().trim();
  return r === 'manager' || r === 'admin' || r === 'founder' || r === 'it_head';
}

function canHaveReportingManager(role) {
  const r = String(role || '').toLowerCase().trim();
  return r === 'employee' || r === 'admin' || r === 'manager';
}

function parseManagerAssignmentFile(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  const headerIndex = findHeaderRowIndex(matrix);
  if (headerIndex === -1) {
    throw new Error('Uploaded file is empty');
  }

  const headers = matrix[headerIndex].map(normalizeImportHeader);
  const columnIndex = {};
  for (const [field, aliases] of Object.entries(IMPORT_HEADERS)) {
    const aliasSet = new Set(aliases.map(normalizeImportHeader));
    const idx = headers.findIndex((header) => aliasSet.has(header));
    if (idx !== -1) columnIndex[field] = idx;
  }

  const required = ['employeecode', 'reportingManager'];
  const missing = required.filter((field) => columnIndex[field] == null);
  if (missing.length > 0) {
    const labels = {
      employeecode: 'Emp code',
      reportingManager: 'Reporting manager',
    };
    throw new Error(`Missing required column(s): ${missing.map((f) => labels[f] || f).join(', ')}`);
  }

  const rows = matrix
    .slice(headerIndex + 1)
    .map((row, index) => ({
      rowNumber: headerIndex + index + 2,
      employeecode: normalizeEmpCode(row[columnIndex.employeecode]),
      name: columnIndex.name != null ? String(row[columnIndex.name] || '').trim() : '',
      reportingManagerValue: normalizeEmpCode(row[columnIndex.reportingManager]),
      reportingManagerCode: normalizeEmpCode(row[columnIndex.reportingManager]),
    }))
    .filter((row) => row.employeecode || row.reportingManagerValue || row.name);

  return {
    rows,
    mappedFields: {
      employeecode: matrix[headerIndex][columnIndex.employeecode],
      name: columnIndex.name != null ? matrix[headerIndex][columnIndex.name] : null,
      reportingManager: matrix[headerIndex][columnIndex.reportingManager],
    },
  };
}

function isJunkRow(row) {
  const code = String(row.employeecode || '').trim();
  if (!code) return true;
  const lower = code.toLowerCase();
  if (['total', 'grand total', 'summary'].includes(lower)) return true;
  return false;
}

async function resolveEmployeeByCode(pool, code) {
  const normalized = normalizeEmpCode(code);
  if (!normalized) return null;
  const { rows } = await pool.query(
    `
      SELECT id, name, employeecode, role, email
      FROM employees
      WHERE trim(employeecode) = $1
         OR upper(trim(employeecode)) = upper($1)
      LIMIT 1
    `,
    [normalized]
  );
  return rows[0] || null;
}

async function resolveEmployeeByName(pool, name, { managerOnly = false } = {}) {
  const normalized = normalizePersonName(name);
  if (!normalized) return null;
  const roleClause = managerOnly
    ? "(role IN ('manager', 'admin', 'founder', 'it_head'))"
    : "(role IN ('employee', 'admin', 'manager'))";

  const exact = await pool.query(
    `
      SELECT id, name, employeecode, role, email
      FROM employees
      WHERE lower(trim(regexp_replace(name, '\\s+', ' ', 'g'))) = $1
        AND ${roleClause}
      ORDER BY id ASC
      LIMIT 2
    `,
    [normalized]
  );
  if (exact.rows.length === 1) return exact.rows[0];
  if (exact.rows.length > 1) return null;

  const partial = await pool.query(
    `
      SELECT id, name, employeecode, role, email
      FROM employees
      WHERE name ILIKE $1
        AND ${roleClause}
      ORDER BY length(name) ASC, id ASC
      LIMIT 2
    `,
    [normalized]
  );
  if (partial.rows.length === 1) return partial.rows[0];
  return null;
}

async function resolveReportingManager(pool, value) {
  const raw = normalizeEmpCode(value);
  if (!raw) return null;
  const byCode = await resolveEmployeeByCode(pool, raw);
  if (byCode && canBeReportingManager(byCode.role)) return byCode;
  return resolveEmployeeByName(pool, raw, { managerOnly: true });
}

async function validateManagerAssignmentRows(pool, rows) {
  const preview = [];
  let validCount = 0;
  let invalidCount = 0;

  for (const row of rows) {
    if (isJunkRow(row)) continue;

    const issues = [];
    if (!row.employeecode) issues.push('Emp code is required');
    if (!row.reportingManagerValue) issues.push('Reporting manager is required');

    let employee = null;
    let manager = null;

    if (row.employeecode) {
      employee = await resolveEmployeeByCode(pool, row.employeecode);
      if (!employee) issues.push('Employee not found for emp code');
      else if (!canHaveReportingManager(employee.role)) {
        issues.push('Person cannot be assigned a reporting manager');
      }
    }

    if (row.reportingManagerValue) {
      manager = await resolveReportingManager(pool, row.reportingManagerValue);
      if (!manager) issues.push('Reporting manager not found (check name or code)');
      else if (!canBeReportingManager(manager.role)) {
        issues.push('Reporting manager must be a manager or admin');
      } else if (employee && manager.id === employee.id) {
        issues.push('Employee cannot report to themselves');
      }
    }

    const status = issues.length ? 'invalid' : 'ready';
    if (issues.length) invalidCount += 1;
    else validCount += 1;

    preview.push({
      ...row,
      reportingManagerCode: manager?.employeecode || row.reportingManagerValue,
      employeeName: employee?.name || row.name || null,
      managerName: manager?.name || row.reportingManagerValue || null,
      status,
      issues: issues.join('; '),
    });
  }

  return { preview, validCount, invalidCount };
}

module.exports = {
  parseManagerAssignmentFile,
  validateManagerAssignmentRows,
  resolveEmployeeByCode,
  resolveEmployeeByName,
  resolveReportingManager,
  normalizeEmpCode,
  isJunkRow,
  canBeReportingManager,
  canHaveReportingManager,
};
