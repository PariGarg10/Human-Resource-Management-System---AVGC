const XLSX = require('xlsx');

function pad2(n) {
  return String(n).padStart(2, '0');
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

  const dmyTime = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmyTime) return `${dmyTime[3]}-${pad2(dmyTime[2])}-${pad2(dmyTime[1])}`;

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

function dateFromYmd(ymd, hour = 0, minute = 0, second = 0) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hour, minute, second);
}

/**
 * Parse punch time; biometric exports often use time-only (09:00) without a date.
 * fallbackDateStr: YYYY-MM-DD applied when value has no calendar date.
 */
function parseDateTimeValue(value, fallbackDateStr) {
  if (value == null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (fallbackDateStr && value.getFullYear() < 1980) {
      return dateFromYmd(
        fallbackDateStr,
        value.getHours(),
        value.getMinutes(),
        value.getSeconds()
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
    return new Date(p.y, p.m - 1, p.d, p.H || 0, p.M || 0, p.S || 0);
  }

  const raw = String(value).trim();

  const dmyTime = raw.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/
  );
  if (dmyTime) {
    return new Date(
      Number(dmyTime[3]),
      Number(dmyTime[2]) - 1,
      Number(dmyTime[1]),
      Number(dmyTime[4]),
      Number(dmyTime[5]),
      Number(dmyTime[6] || 0)
    );
  }

  const isoTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (isoTime) {
    return new Date(
      Number(isoTime[1]),
      Number(isoTime[2]) - 1,
      Number(isoTime[3]),
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
    if (fallbackDateStr && d.getFullYear() < 1980) {
      return dateFromYmd(fallbackDateStr, d.getHours(), d.getMinutes(), d.getSeconds());
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

/** Find header row and return objects keyed by column titles (Name, InTime, …). */
function readAttendanceRowsFromFile(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  let headerIndex = matrix.findIndex((row) => {
    const cells = row.map((c) => normalizeHeader(c));
    const hasName = cells.some((c) => c === 'name' || c === 'employee name' || c === 'emp name');
    const hasIn = cells.some(
      (c) => c === 'intime' || c === 'in time' || c === 'in' || c.includes('in time')
    );
    return hasName && hasIn;
  });

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

  return { rows, headerRow: headerIndex + 1, headers };
}

/**
 * Name | Shift | InTime | OutTime | Work Dur. | OT | Tot. Dur. | Status
 */
function parseAttendanceRow(row, options = {}) {
  const fallbackDate = options.fallbackDate || null;

  const employeeName = String(
    pickRowField(row, ['name', 'employee name', 'emp name', 'full name']) || ''
  ).trim();

  const employeecode = String(
    pickRowField(row, ['employee code', 'emp code', 'employeecode', 'employee id', 'emp id']) || ''
  ).trim();

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
  const punchOut = parseDateTimeValue(punchOutRaw, fallbackDate);

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
    date,
    punchIn,
    punchOut,
    totalHours,
    statusInput,
  };
}

module.exports = {
  normalizeImportDate,
  normalizePersonName,
  readAttendanceRowsFromFile,
  parseAttendanceRow,
  parseDurationHours,
};
