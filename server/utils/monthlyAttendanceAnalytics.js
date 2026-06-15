const XLSX = require('xlsx');
const {
  normalizeHeader,
  normalizeImportDate,
  parseAttendanceRow,
} = require('./attendanceImport');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseFlexibleDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1000) {
    return normalizeImportDate(value);
  }
  const raw = String(value).trim();
  const dmy = raw.match(/^(\d{1,2})[-/](\w{3,9})[-/](\d{4})$/i);
  if (dmy) {
    const months = {
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      oct: 10,
      nov: 11,
      dec: 12,
    };
    const m = months[dmy[2].slice(0, 3).toLowerCase()];
    if (m) return `${dmy[3]}-${pad2(m)}-${pad2(dmy[1])}`;
  }
  const numeric = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numeric) {
    return `${numeric[3]}-${pad2(numeric[2])}-${pad2(numeric[1])}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

function isAttendanceDateSectionRow(row) {
  const combined = row
    .map((cell) => String(cell ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /attendance\s*date/i.test(combined);
}

function extractAttendanceDateFromRow(row) {
  if (!isAttendanceDateSectionRow(row)) return null;

  const combined = row
    .map((cell) => String(cell ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const combinedMatch = combined.match(
    /attendance\s*date\s*[:：]?\s*(\d{1,2}[-/][\w]{3,9}[-/]\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/i
  );
  if (combinedMatch) {
    const parsed = parseFlexibleDate(combinedMatch[1]);
    if (parsed) return parsed;
  }

  for (let i = 0; i < row.length; i += 1) {
    const raw = String(row[i] ?? '').trim();
    if (!raw) continue;
    const labeled = raw.match(/attendance\s*date\s*[:：]?\s*(.*)$/i);
    if (labeled) {
      const inline = labeled[1].trim();
      if (inline) {
        const parsed = parseFlexibleDate(inline);
        if (parsed) return parsed;
      }
      for (let j = i + 1; j < Math.min(i + 4, row.length); j += 1) {
        const next = String(row[j] ?? '').trim();
        if (!next) continue;
        const parsed = parseFlexibleDate(next);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

function extractPeriodFromMatrix(matrix) {
  for (const row of matrix.slice(0, 8)) {
    for (const cell of row) {
      const raw = String(cell ?? '').trim();
      if (/to/i.test(raw) && /\d{4}/.test(raw) && /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2})/i.test(raw)) {
        return raw;
      }
    }
  }
  return null;
}

function isHeaderRow(row) {
  const cells = row.map((c) => normalizeHeader(c));
  const hasName = cells.some(
    (c) =>
      c === 'name' ||
      c === 'employee name' ||
      c === 'emp name' ||
      c === 'empname' ||
      c.endsWith(' name')
  );
  const hasCode = cells.some(
    (c) =>
      c === 'e code' ||
      c === 'e. code' ||
      c === 'emp code' ||
      c === 'employee code' ||
      c === 'employeecode' ||
      c === 'sno'
  );
  const hasIn = cells.some(
    (c) => c === 'intime' || c === 'in time' || c === 'in' || c.endsWith('in time')
  );
  return (hasName || hasCode) && hasIn;
}

function rowToObject(headers, line) {
  const obj = {};
  headers.forEach((header, idx) => {
    obj[header] = line[idx];
  });
  return obj;
}

function normalizeStatusForAnalytics(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!raw) return '';
  if (
    raw.includes('½') ||
    raw.includes('1/2') ||
    raw.includes('half') ||
    raw === 'hd' ||
    raw === 'halfday'
  ) {
    return 'halfday';
  }
  if (raw.includes('present') || raw === 'p' || raw === 'pr') return 'present';
  if (raw.includes('absent') || raw === 'a' || raw === 'ab') return 'absent';
  if (raw.includes('leave') || raw === 'l' || raw === 'on leave') return 'leave';
  return raw;
}

function parseClockToMinutes(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getHours() * 60 + value.getMinutes();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0 && value < 1) {
      const total = Math.round(value * 24 * 60);
      return total;
    }
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return (parsed.H || 0) * 60 + (parsed.M || 0);
  }
  const raw = String(value).trim();
  const hm = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!hm) return null;
  let h = Number(hm[1]);
  const m = Number(hm[2]);
  const ampm = (hm[4] || '').toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return h * 60 + m;
}

function parseClockSetting(value, fallback) {
  const mins = parseClockToMinutes(value);
  if (mins != null) return mins;
  const fb = parseClockToMinutes(fallback);
  return fb != null ? fb : 9 * 60 + 30;
}

function compareEmpCode(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
}

/**
 * Parse biometric-style monthly export: repeated "Attendance Date" sections per day.
 */
function parseMonthlyDailyAttendanceMatrix(matrix) {
  let currentDate = null;
  let headers = null;
  const dailyRows = [];
  const datesSeen = new Set();

  for (const row of matrix) {
    if (!row.some((cell) => String(cell ?? '').trim())) continue;

    const sectionDate = extractAttendanceDateFromRow(row);
    if (sectionDate) {
      currentDate = sectionDate;
      headers = null;
      continue;
    }

    if (isHeaderRow(row)) {
      headers = row.map((h, idx) => {
        const label = String(h || '').trim();
        return label || `Column${idx + 1}`;
      });
      continue;
    }

    if (!headers || !currentDate) continue;

    if (isHeaderRow(row)) {
      headers = row.map((h, idx) => {
        const label = String(h || '').trim();
        return label || `Column${idx + 1}`;
      });
      continue;
    }

    const parsed = parseAttendanceRow(rowToObject(headers, row), { fallbackDate: currentDate });
    if (!parsed.employeecode && !parsed.employeeName) continue;

    const codeLabel = String(parsed.employeecode || '')
      .trim()
      .toLowerCase();
    const nameLabel = String(parsed.employeeName || '')
      .trim()
      .toLowerCase();
    if (
      codeLabel === 'e. code' ||
      codeLabel === 'e code' ||
      codeLabel === 'emp code' ||
      nameLabel === 'name' ||
      nameLabel === 'employee name'
    ) {
      continue;
    }

    if (!parsed.date) parsed.date = currentDate;
    dailyRows.push(parsed);
    if (parsed.date) datesSeen.add(parsed.date);
  }

  return { dailyRows, datesSeen };
}

function readWorkbookMatrices(source, { fromBuffer = false } = {}) {
  const workbook = fromBuffer
    ? XLSX.read(source, { type: 'buffer', cellDates: true })
    : XLSX.readFile(source, { cellDates: true });

  return workbook.SheetNames.map((name) =>
    XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' })
  ).filter((matrix) => matrix.length > 0);
}

function parseMatricesToDailyRows(matrices) {
  const dailyRows = [];
  const datesSeen = new Set();
  let period = null;

  for (const matrix of matrices) {
    if (!period) period = extractPeriodFromMatrix(matrix);
    const parsed = parseMonthlyDailyAttendanceMatrix(matrix);
    for (const row of parsed.dailyRows) dailyRows.push(row);
    parsed.datesSeen.forEach((d) => datesSeen.add(d));
  }

  if (!dailyRows.length) {
    for (const matrix of matrices) {
      let sectionDate = null;
      let headers = null;
      for (const line of matrix) {
        if (!line.some((cell) => String(cell ?? '').trim())) continue;

        const section = extractAttendanceDateFromRow(line);
        if (section) {
          sectionDate = section;
          headers = null;
          continue;
        }
        if (isHeaderRow(line)) {
          headers = line.map((h, idx) => {
            const label = String(h || '').trim();
            return label || `Column${idx + 1}`;
          });
          continue;
        }
        if (!headers || !sectionDate) continue;

        const parsed = parseAttendanceRow(rowToObject(headers, line), {
          fallbackDate: sectionDate,
        });
        if (!parsed.employeecode && !parsed.employeeName) continue;

        const codeLabel = String(parsed.employeecode || '')
          .trim()
          .toLowerCase();
        const nameLabel = String(parsed.employeeName || '')
          .trim()
          .toLowerCase();
        if (
          codeLabel === 'e. code' ||
          codeLabel === 'e code' ||
          codeLabel === 'emp code' ||
          nameLabel === 'name' ||
          nameLabel === 'employee name' ||
          /^\d{1,2}[-/][\w]{3,9}[-/]\d{4}$/i.test(codeLabel)
        ) {
          continue;
        }

        if (!parsed.date) parsed.date = sectionDate;
        dailyRows.push(parsed);
        if (parsed.date) datesSeen.add(parsed.date);
      }
    }
  }

  return {
    dailyRows,
    meta: {
      period,
      daysParsed: datesSeen.size,
      rowsParsed: dailyRows.length,
    },
  };
}

/**
 * Parse uploaded monthly daily attendance export into per-day rows.
 */
function parseMonthlyDailyAttendanceFile(filePath) {
  const matrices = readWorkbookMatrices(filePath);
  if (!matrices.length) throw new Error('Uploaded file is empty');
  const result = parseMatricesToDailyRows(matrices);
  if (!result.dailyRows.length) {
    throw new Error(
      'No attendance rows found. Use the biometric daily export with E. Code, Name, InTime, OutTime, Status, and Attendance Date per day.'
    );
  }
  return result;
}

function parseMonthlyDailyAttendanceBuffer(buffer) {
  if (!buffer?.length) throw new Error('Uploaded file is empty');
  const matrices = readWorkbookMatrices(buffer, { fromBuffer: true });
  if (!matrices.length) throw new Error('Uploaded file is empty');
  const result = parseMatricesToDailyRows(matrices);
  if (!result.dailyRows.length) {
    throw new Error(
      'No attendance rows found. Use the biometric daily export with E. Code, Name, InTime, OutTime, Status, and Attendance Date per day.'
    );
  }
  return result;
}

function resolveDayStatus(row) {
  const fromSheet = normalizeStatusForAnalytics(row.statusInput);
  if (fromSheet) return fromSheet;
  if (row.punchIn || row.punchOut) return 'present';
  return 'absent';
}

/**
 * Aggregate per employee: present, absent, leave, late, early leave (before 6:30 PM).
 */
function aggregateMonthlyStats(dailyRows, options = {}) {
  const lateAfterMin = parseClockSetting(
    options.lateAfter,
    process.env.ESSL_DAY_START || '09:30'
  );
  const earlyBeforeMin = parseClockSetting(options.earlyBefore, '18:30');

  const byEmp = new Map();

  for (const row of dailyRows) {
    const code = String(row.employeecode || '').trim();
    const name = String(row.employeeName || '').trim();
    const key = code || name.toLowerCase();
    if (!key) continue;

    if (!byEmp.has(key)) {
      byEmp.set(key, {
        employeecode: code,
        name,
        present: 0,
        absent: 0,
        leave: 0,
        late: 0,
        earlyLeave: 0,
      });
    }

    const acc = byEmp.get(key);
    if (name) acc.name = name;
    if (code) acc.employeecode = code;

    const status = resolveDayStatus(row);

    if (status === 'present' || status === 'halfday') acc.present += 1;
    else if (status === 'absent') acc.absent += 1;
    else if (status === 'leave') acc.leave += 1;
    else acc.absent += 1;

    const countsForTime = status === 'present' || status === 'halfday';

    if (countsForTime && row.punchIn) {
      const inMin = parseClockToMinutes(row.punchIn);
      if (inMin != null && inMin > lateAfterMin) acc.late += 1;
    }

    if (countsForTime && row.punchOut) {
      const outMin = parseClockToMinutes(row.punchOut);
      if (outMin != null && outMin < earlyBeforeMin) acc.earlyLeave += 1;
    }
  }

  return [...byEmp.values()].sort(
    (a, b) => compareEmpCode(a.employeecode, b.employeecode) || a.name.localeCompare(b.name)
  );
}

function buildSummaryWorkbook(summaryRows, meta = {}) {
  const aoa = [['Monthly Attendance Summary']];
  if (meta.period) aoa.push([`Period: ${meta.period}`]);
  if (meta.daysParsed != null) aoa.push([`Working days in file: ${meta.daysParsed}`]);
  if (meta.rowsParsed != null) aoa.push([`Daily rows parsed: ${meta.rowsParsed}`]);
  aoa.push([]);
  aoa.push([
    'Emp Code',
    'Name',
    'Present',
    'Absent Days',
    'Leave',
    'Late',
    'Went Early (before 6:30)',
  ]);

  for (const row of summaryRows) {
    aoa.push([
      row.employeecode,
      row.name,
      row.present,
      row.absent,
      row.leave,
      row.late,
      row.earlyLeave,
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [
    { wch: 10 },
    { wch: 28 },
    { wch: 10 },
    { wch: 12 },
    { wch: 8 },
    { wch: 8 },
    { wch: 22 },
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Monthly Summary');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  parseMonthlyDailyAttendanceFile,
  parseMonthlyDailyAttendanceBuffer,
  aggregateMonthlyStats,
  buildSummaryWorkbook,
};
