const XLSX = require('xlsx');
const { normalizeHolidayDate, isValidHolidayDate } = require('./holidaysRange');

const ALLOWED_TYPES = new Set(['national', 'festival', 'optional']);

const TYPE_ALIASES = new Map([
  ['national', 'national'],
  ['national holiday', 'national'],
  ['govt holiday', 'national'],
  ['government holiday', 'national'],
  ['public holiday', 'national'],
  ['festival', 'festival'],
  ['festival holiday', 'festival'],
  ['optional', 'optional'],
  ['optional holiday', 'optional'],
  ['restricted', 'optional'],
  ['restricted holiday', 'optional'],
]);

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeHolidayType(value) {
  const key = normalizeHeader(value || '');
  if (!key) return null;
  if (TYPE_ALIASES.has(key)) return TYPE_ALIASES.get(key);
  if (key.includes('national')) return 'national';
  if (key.includes('festival')) return 'festival';
  if (key.includes('optional') || key.includes('restricted')) return 'optional';
  return null;
}

function findColumnIndex(headers, patterns) {
  return headers.findIndex((h) => patterns.some((p) => (typeof p === 'string' ? h === p : p.test(h))));
}

function parseHolidayWorkbookBuffer(buffer) {
  if (!buffer?.length) throw new Error('Uploaded file is empty');

  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Uploaded file has no worksheets');

  const firstSheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  const headerIndex = matrix.findIndex((row) => row.some((cell) => String(cell || '').trim()));
  if (headerIndex === -1) throw new Error('Uploaded file is empty');

  const headers = matrix[headerIndex].map(normalizeHeader);
  const nameIndex = findColumnIndex(headers, [
    'holiday name',
    'holiday',
    'name',
    'title',
    'description',
    /^holiday\b/,
  ]);
  const dateIndex = findColumnIndex(headers, ['date', 'holiday date', 'day', /^date\b/]);
  const typeIndex = findColumnIndex(headers, ['type', 'holiday type', 'category', 'holiday type name']);

  if (nameIndex === -1 || dateIndex === -1) {
    throw new Error(
      'Missing required columns. Your sheet must include Holiday Name (or Holiday) and Date. Optional: Type.'
    );
  }

  return matrix
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell || '').trim()))
    .map((row, index) => {
      const rawType = typeIndex === -1 ? 'national' : row[typeIndex];
      return {
        rowNumber: headerIndex + index + 2,
        holidayName: String(row[nameIndex] || '').trim(),
        date: normalizeHolidayDate(row[dateIndex]),
        type: normalizeHolidayType(rawType) || 'national',
      };
    });
}

function holidayRowError(row) {
  if (!row.holidayName || !isValidHolidayDate(row.date)) {
    return 'Holiday Name and valid Date (DD/MM/YYYY or YYYY-MM-DD) are required';
  }
  if (!row.type || !ALLOWED_TYPES.has(row.type)) {
    return 'Type must be National Holiday, Festival, or Optional';
  }
  return null;
}

function validateHolidayRows(rows) {
  const seenDates = new Set();
  return rows.map((row) => {
    const baseError = holidayRowError(row);
    if (baseError) return { row, error: baseError };
    if (seenDates.has(row.date)) {
      return { row, error: 'Duplicate holiday date in uploaded file' };
    }
    seenDates.add(row.date);
    return { row, error: null };
  });
}

function buildSampleWorkbookBuffer() {
  const rows = [
    ['Holiday Name', 'Date', 'Type'],
    ['Republic Day', '26/01/2026', 'National Holiday'],
    ['Holi', '14/03/2026', 'Festival'],
    ['Optional leave day', '15/08/2026', 'Optional'],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Holidays');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  ALLOWED_TYPES,
  parseHolidayWorkbookBuffer,
  validateHolidayRows,
  buildSampleWorkbookBuffer,
};
