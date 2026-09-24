const XLSX = require('xlsx');

/** Office wall-clock timezone — AWS EB runs UTC; punches must stay IST. */
const BUSINESS_TZ = process.env.HRMS_TIMEZONE || 'Asia/Kolkata';
const BUSINESS_TZ_OFFSET = process.env.HRMS_TZ_OFFSET || '+05:30';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function addDaysToYmd(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Normalize Excel / text values to YYYY-MM-DD for PostgreSQL DATE. */
function normalizeImportDate(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
  }

  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;

  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slash) return `${slash[3]}-${pad2(slash[2])}-${pad2(slash[1])}`;

  const dmyMon = raw.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{4})$/);
  if (dmyMon) {
    const parsedMon = new Date(`${dmyMon[1]} ${dmyMon[2]} ${dmyMon[3]}`);
    if (!Number.isNaN(parsedMon.getTime())) {
      return `${parsedMon.getFullYear()}-${pad2(parsedMon.getMonth() + 1)}-${pad2(parsedMon.getDate())}`;
    }
  }

  const parsedDate = new Date(raw);
  if (!Number.isNaN(parsedDate.getTime())) {
    return `${parsedDate.getFullYear()}-${pad2(parsedDate.getMonth() + 1)}-${pad2(parsedDate.getDate())}`;
  }

  return null;
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickRowField(row, aliases) {
  const aliasSet = new Set(aliases.map(normalizeHeader));
  for (const [key, val] of Object.entries(row)) {
    if (aliasSet.has(normalizeHeader(key))) return val;
  }
  return undefined;
}

/** Build a Date from office wall-clock (IST), not the server's local timezone. */
function dateFromYmd(ymd, hour = 0, minute = 0, second = 0) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return null;
  const iso = `${y}-${pad2(m)}-${pad2(d)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}${BUSINESS_TZ_OFFSET}`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Parse punch time; biometric exports often use time-only (09:00) without a date.
 * fallbackDateStr: YYYY-MM-DD applied when value has no calendar date.
 */
function parseDateTimeValue(value, fallbackDateStr) {
  if (value == null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (fallbackDateStr) {
      // Daily biometric export: InTime/OutTime are IST wall-clock on fallbackDate.
      // Never pass through raw Date — on AWS (UTC) that stores the wrong instant.
      return dateFromYmd(
        fallbackDateStr,
        value.getUTCHours(),
        value.getUTCMinutes(),
        value.getUTCSeconds()
      );
    }
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const p = XLSX.SSF.parse_date_code(value);
    if (!p) return null;
    if (value > 0 && value < 1 && fallbackDateStr) {
      return dateFromYmd(fallbackDateStr, p.H || 0, p.M || 0, p.S || 0);
    }
    if (p.y && p.m && p.d) {
      return dateFromYmd(`${p.y}-${pad2(p.m)}-${pad2(p.d)}`, p.H || 0, p.M || 0, p.S || 0);
    }
    return null;
  }

  const raw = String(value).trim();

  const dmyTime = raw.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/
  );
  if (dmyTime) {
    return dateFromYmd(
      `${Number(dmyTime[3])}-${pad2(Number(dmyTime[2]))}-${pad2(Number(dmyTime[1]))}`,
      Number(dmyTime[4]),
      Number(dmyTime[5]),
      Number(dmyTime[6] || 0)
    );
  }

  const isoTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (isoTime) {
    return dateFromYmd(
      `${isoTime[1]}-${isoTime[2]}-${isoTime[3]}`,
      Number(isoTime[4]),
      Number(isoTime[5]),
      Number(isoTime[6] || 0)
    );
  }

  const timeOnly = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (timeOnly && fallbackDateStr) {
    let h = Number(timeOnly[1]);
    const mi = Number(timeOnly[2]);
    const sec = Number(timeOnly[3] || 0);
    const ampm = (timeOnly[4] || '').toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return dateFromYmd(fallbackDateStr, h, mi, sec);
  }

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    if (fallbackDateStr) {
      return dateFromYmd(
        fallbackDateStr,
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds()
      );
    }
    return d;
  }

  return null;
}

function parseDurationHours(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0 && value < 1) return Number((value * 24).toFixed(2));
    return value;
  }
  const raw = String(value).trim();
  const num = Number(raw);
  if (!Number.isNaN(num)) return num;
  const hm = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hm) {
    return Number(hm[1]) + Number(hm[2]) / 60 + (hm[3] ? Number(hm[3]) / 3600 : 0);
  }
  return null;
}

function normalizePersonName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Allow first-name / prefix matching for imports like "Ravi" → "Ravi Pingali". */
function nameLooseMatchSql(columnExpr) {
  return `(
    lower(trim(${columnExpr})) = lower($1)
    OR lower(split_part(trim(${columnExpr}), ' ', 1)) = lower($1)
    OR lower(trim(${columnExpr})) LIKE lower($1) || ' %'
  )`;
}

function pickUniquePerson(rows) {
  if (!rows?.length) return null;
  if (rows.length === 1) return rows[0];
  return null;
}

function isCompanyEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
    .endsWith('@avgcstudios.com');
}

function isAdminRole(role) {
  const r = String(role || '').toLowerCase().trim();
  return r === 'admin' || r === 'founder' || r === 'it_head';
}

/** When several people share a first name, pick the best single match. */
function pickBestPerson(rows, queryName) {
  if (!rows?.length) return null;
  if (rows.length === 1) return rows[0];

  const normalized = normalizePersonName(queryName).toLowerCase();
  const exact = rows.filter((r) => normalizePersonName(r.name).toLowerCase() === normalized);
  if (exact.length === 1) return exact[0];

  const company = rows.filter((r) => isCompanyEmail(r.email || r.admin_email));
  if (company.length === 1) return company[0];

  const adminCompany = rows.filter(
    (r) => isAdminRole(r.role) && isCompanyEmail(r.email || r.admin_email)
  );
  if (adminCompany.length === 1) return adminCompany[0];

  const adminRole = rows.filter((r) => isAdminRole(r.role));
  if (adminRole.length === 1) return adminRole[0];

  const linkedAdmin = rows.filter((r) => r.admin_id);
  if (linkedAdmin.length === 1) return linkedAdmin[0];

  return null;
}

async function findNameMatchCandidates(db, name) {
  if (!name) return [];
  const { rows: employees } = await db.query(
    `
      SELECT e.id, e.name, e.employeecode, e.role, e.email, NULL::int AS admin_id, NULL::text AS admin_email
      FROM employees e
      WHERE ${nameLooseMatchSql('e.name')}
    `,
    [name]
  );
  const { rows: admins } = await db.query(
    `
      SELECT e.id, COALESCE(e.name, a.name) AS name, e.employeecode, e.role, COALESCE(e.email, a.email) AS email,
             a.id AS admin_id, a.email AS admin_email
      FROM admins a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.is_active = TRUE
        AND (
          ${nameLooseMatchSql('a.name')}
          OR ${nameLooseMatchSql('e.name')}
        )
    `,
    [name]
  );

  const merged = new Map();
  for (const row of [...employees, ...admins]) {
    if (!row?.id) continue;
    merged.set(row.id, row);
  }
  return [...merged.values()];
}

async function explainAttendanceMatchFailure(db, { employeecode, employeeName, email }) {
  const code = String(employeecode || '').trim();
  const name = normalizePersonName(employeeName);
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (code) return `No employee/admin found with code "${code}"`;
  if (normalizedEmail) return `No employee/admin found with email "${normalizedEmail}"`;

  if (name) {
    const candidates = await findNameMatchCandidates(db, name);
    if (candidates.length > 1) {
      const list = candidates
        .map((r) => `${r.name} (${r.employeecode || 'no code'})`)
        .join(', ');
      return `Multiple people match "${name}": ${list}. Add Employee Code column to the file.`;
    }
    if (candidates.length === 1) {
      return `Could not uniquely match "${name}" — try full name or employee code ${candidates[0].employeecode || ''}`.trim();
    }
  }

  return 'No matching employee or admin in HRMS';
}

function normalizeStatus(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) return '';
  if (['p', 'present', 'pr'].includes(raw)) return 'present';
  if (['a', 'absent', 'ab'].includes(raw)) return 'absent';
  if (['hd', 'half', 'halfday', 'half day'].includes(raw)) return 'halfday';
  if (['l', 'leave', 'on leave'].includes(raw)) return 'leave';
  return raw;
}

function stringifyEmployeeCode(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return String(value).trim().replace(/\.0+$/, '');
}

/** Detect biometric daily export header row (skips Department / Default rows above). */
function isAttendanceHeaderRow(row) {
  const cells = row.map((c) => normalizeHeader(c));
  const hasIn = cells.some(
    (c) => c === 'intime' || c === 'in time' || c === 'in' || c.includes('in time')
  );
  if (!hasIn) return false;
  const hasCode = cells.some(
    (c) =>
      c === 'e code' ||
      c === 'employee code' ||
      c === 'emp code' ||
      c === 'employeecode' ||
      c === 'enroll no'
  );
  const hasName = cells.some((c) => c === 'name' || c === 'employee name' || c === 'emp name');
  return hasCode || hasName;
}

/** Read "Attendance Date: 17-Aug-2026" from rows above the table header. */
function extractAttendanceDateFromMatrix(matrix) {
  for (const row of matrix.slice(0, 20)) {
    for (let i = 0; i < row.length; i += 1) {
      const cell = String(row[i] ?? '').trim();
      const inline = cell.match(/attendance\s*date\s*:?\s*(.+)$/i);
      if (inline) {
        const d = normalizeImportDate(inline[1].trim());
        if (d) return d;
      }
      if (/attendance\s*date/i.test(cell) && i + 1 < row.length) {
        const d = normalizeImportDate(row[i + 1]);
        if (d) return d;
      }
    }
  }
  return null;
}

/** Find header row and return objects keyed by column titles (SNo, E. Code, Name, InTime, …). */
function readAttendanceRowsFromFile(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  let headerIndex = matrix.findIndex((row) => isAttendanceHeaderRow(row));

  if (headerIndex === -1) {
    headerIndex = matrix.findIndex((row) => row.some((cell) => String(cell || '').trim()));
    if (headerIndex === -1) throw new Error('Uploaded file is empty');
  }

  const headers = matrix[headerIndex].map((h, idx) => {
    const label = String(h || '').trim();
    return label || `Column${idx + 1}`;
  });

  const rows = [];
  for (let i = headerIndex + 1; i < matrix.length; i += 1) {
    const line = matrix[i];
    if (!line.some((cell) => String(cell ?? '').trim())) continue;
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = line[idx];
    });
    rows.push(obj);
  }

  const attendanceDate = extractAttendanceDateFromMatrix(matrix);

  return { rows, headerRow: headerIndex + 1, headers, attendanceDate };
}

/**
 * Biometric daily export columns (order):
 * SNo | E. Code | Name | Shift | InTime | OutTime | Work Dur. | OT | Tot. Dur. | Status | Remarks
 */
function parseAttendanceRow(row, options = {}) {
  const fallbackDate = options.fallbackDate || null;

  const employeeName = String(
    pickRowField(row, ['name', 'employee name', 'emp name', 'full name']) || ''
  ).trim();

  const employeecode = stringifyEmployeeCode(
    pickRowField(row, [
      'e code',
      'e. code',
      'e code.',
      'employee code',
      'emp code',
      'employeecode',
      'employee id',
      'emp id',
      'user id',
      'userid',
      'enroll no',
      'enroll number',
      'enrollment number',
      'biometric id',
      'device user id',
    ])
  );

  const email = String(
    pickRowField(row, ['email', 'work email', 'employee email', 'mail']) || ''
  )
    .trim()
    .toLowerCase();

  const punchInRaw = pickRowField(row, [
    'intime',
    'in time',
    'in',
    'punch in',
    'punchin',
    'check in',
  ]);
  const punchOutRaw = pickRowField(row, [
    'outtime',
    'out time',
    'out',
    'punch out',
    'punchout',
    'check out',
  ]);

  const punchIn = parseDateTimeValue(punchInRaw, fallbackDate);
  let punchOut = parseDateTimeValue(punchOutRaw, fallbackDate);
  if (punchIn && punchOut && punchOut.getTime() <= punchIn.getTime() && fallbackDate) {
    const nextDay = addDaysToYmd(fallbackDate, 1);
    if (nextDay) punchOut = parseDateTimeValue(punchOutRaw, nextDay);
  }

  let date = normalizeImportDate(pickRowField(row, ['date', 'attendance date', 'work date']));
  if (!date && punchIn) date = normalizeImportDate(punchIn);
  if (!date && punchOut) date = normalizeImportDate(punchOut);
  if (!date && fallbackDate) date = fallbackDate;

  let totalHours = parseDurationHours(
    pickRowField(row, ['tot dur', 'tot. dur', 'total duration', 'total dur', 'tot dur.'])
  );
  if (totalHours == null) {
    totalHours = parseDurationHours(
      pickRowField(row, ['work dur', 'work dur.', 'work duration', 'work duration.'])
    );
  }

  const statusInput = normalizeStatus(pickRowField(row, ['status']));

  return {
    employeeName,
    employeecode,
    email,
    date,
    punchIn,
    punchOut,
    totalHours,
    statusInput,
  };
}

function codeMatchSql(columnExpr) {
  return `(
    trim(${columnExpr}) = $1
    OR upper(trim(${columnExpr})) = upper($1)
    OR ltrim(trim(${columnExpr}), '0') = ltrim($1, '0')
  )`;
}

async function findEmployeeByCode(db, code) {
  if (!code) return null;
  const { rows } = await db.query(
    `
      SELECT id, name, employeecode
      FROM employees
      WHERE ${codeMatchSql('employeecode')}
      LIMIT 1
    `,
    [code]
  );
  return rows[0] || null;
}

async function findEmployeeByName(db, name) {
  if (!name) return null;
  const rows = await findNameMatchCandidates(db, name);
  return pickBestPerson(rows, name);
}

async function findEmployeeByEmail(db, email) {
  if (!email) return null;
  const { rows } = await db.query(
    `
      SELECT id, name, employeecode
      FROM employees
      WHERE lower(trim(email)) = lower($1)
      LIMIT 1
    `,
    [email]
  );
  return rows[0] || null;
}

/** Link admin to an employee row when only email matches (attendance writes to employees.id). */
async function linkAdminToEmployee(db, adminId, employeeId) {
  if (!adminId || !employeeId) return;
  await db.query(
    `
      UPDATE admins
      SET employee_id = $2
      WHERE id = $1 AND (employee_id IS NULL OR employee_id <> $2)
    `,
    [adminId, employeeId]
  );
}

/**
 * Match active admin-access accounts (admins table + admin/founder/it_head employee roles).
 */
async function findAdminAccessPerson(db, { employeecode, employeeName, email }) {
  const code = String(employeecode || '').trim();
  const name = normalizePersonName(employeeName);
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (code) {
    const { rows } = await db.query(
      `
        SELECT e.id, e.name, e.employeecode, a.id AS admin_id
        FROM admins a
        INNER JOIN employees e ON e.id = a.employee_id
        WHERE a.is_active = TRUE
          AND ${codeMatchSql('e.employeecode')}
        LIMIT 1
      `,
      [code]
    );
    if (rows[0]) return rows[0];

    const { rows: roleRows } = await db.query(
      `
        SELECT e.id, e.name, e.employeecode, NULL::int AS admin_id
        FROM employees e
        WHERE lower(trim(e.role)) IN ('admin', 'founder', 'it_head')
          AND ${codeMatchSql('e.employeecode')}
        LIMIT 1
      `,
      [code]
    );
    if (roleRows[0]) return roleRows[0];
  }

  if (normalizedEmail) {
    const { rows } = await db.query(
      `
        SELECT e.id, e.name, e.employeecode, a.id AS admin_id
        FROM admins a
        INNER JOIN employees e ON lower(trim(e.email)) = lower(trim(a.email))
        WHERE a.is_active = TRUE
          AND lower(trim(a.email)) = $1
        LIMIT 1
      `,
      [normalizedEmail]
    );
    if (rows[0]) {
      await linkAdminToEmployee(db, rows[0].admin_id, rows[0].id);
      return rows[0];
    }

    const byEmail = await findEmployeeByEmail(db, normalizedEmail);
    if (byEmail) {
      const adminCheck = await db.query(
        `
          SELECT id FROM admins
          WHERE is_active = TRUE
            AND (employee_id = $1 OR lower(trim(email)) = $2)
          LIMIT 1
        `,
        [byEmail.id, normalizedEmail]
      );
      const roleCheck = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND lower(trim(role)) IN ('admin', 'founder', 'it_head')`,
        [byEmail.id]
      );
      if (adminCheck.rows[0] || roleCheck.rows[0]) return byEmail;
    }
  }

  if (name) {
    const rows = await findNameMatchCandidates(db, name);
    const adminRows = rows.filter((r) => r.admin_id);
    const adminMatch = pickBestPerson(adminRows.length ? adminRows : rows, name);
    if (adminMatch?.id) return adminMatch;

    if (adminMatch?.admin_email) {
      const byAdminEmail = await findEmployeeByEmail(db, adminMatch.admin_email);
      if (byAdminEmail) {
        await linkAdminToEmployee(db, adminMatch.admin_id, byAdminEmail.id);
        return byAdminEmail;
      }
    }

    const roleMatch = pickBestPerson(
      rows.filter((r) => isAdminRole(r.role)),
      name
    );
    if (roleMatch) return roleMatch;
  }

  return null;
}

/**
 * Resolve a file/device row to an employees.id for attendancelogs.
 * Matches regular employees, then admin-access accounts (admins + admin roles).
 */
async function resolveAttendanceEmployee(db, { employeecode, employeeName, email }, options = {}) {
  let code = stringifyEmployeeCode(employeecode);
  let name = normalizePersonName(employeeName);
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const matchByCodeOnly = options.matchByCodeOnly === true;

  // Biometric exports sometimes put the device user id in the name column (e.g. "1081").
  if (name && !code && /^\d+[a-z]?$/i.test(name)) {
    code = name;
    name = '';
  }

  if (code) {
    const employee = await findEmployeeByCode(db, code);
    if (employee) return employee;

    const adminPerson = await findAdminAccessPerson(db, {
      employeecode: code,
      employeeName: '',
      email: '',
    });
    if (adminPerson?.id) {
      return {
        id: adminPerson.id,
        name: adminPerson.name,
        employeecode: adminPerson.employeecode,
      };
    }

    if (matchByCodeOnly) return null;
  }

  if (normalizedEmail) {
    const employee = await findEmployeeByEmail(db, normalizedEmail);
    if (employee) return employee;
  }

  if (name) {
    const employee = await findEmployeeByName(db, name);
    if (employee) return employee;
  }

  const adminPerson = await findAdminAccessPerson(db, {
    employeecode: code,
    employeeName: name,
    email: normalizedEmail,
  });
  if (adminPerson?.id) {
    return {
      id: adminPerson.id,
      name: adminPerson.name,
      employeecode: adminPerson.employeecode,
    };
  }

  return null;
}

/** Store punch times as IST wall-clock (+05:30) so AWS UTC servers don't shift times. */
function punchTimestampForStorage(dateObj, fallbackDateYmd) {
  if (!dateObj || Number.isNaN(dateObj.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: BUSINESS_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(dateObj)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  );
  if (!parts.year) {
    if (!fallbackDateYmd) return null;
    const [y, m, d] = String(fallbackDateYmd).split('-');
    return `${y}-${m}-${d}T00:00:00${BUSINESS_TZ_OFFSET}`;
  }
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${BUSINESS_TZ_OFFSET}`;
}

module.exports = {
  normalizeImportDate,
  normalizeHeader,
  normalizePersonName,
  stringifyEmployeeCode,
  readAttendanceRowsFromFile,
  parseAttendanceRow,
  parseDurationHours,
  punchTimestampForStorage,
  resolveAttendanceEmployee,
  explainAttendanceMatchFailure,
  ATTENDANCE_IMPORT_COLUMNS: [
    'SNo',
    'E. Code',
    'Name',
    'Shift',
    'InTime',
    'OutTime',
    'Work Dur.',
    'OT',
    'Tot. Dur.',
    'Status',
    'Remarks',
  ],
};
