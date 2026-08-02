const XLSX = require('xlsx');
const { computeManhoursPerUnit } = require('./efficiencyMetrics');

const IMPORT_HEADERS = {
  projectName: ['project name', 'project', 'project_name'],
  taskName: ['task name', 'task', 'task_name'],
  versionLabel: ['version label', 'version', 'version_label'],
  unitLabel: ['unit label', 'unit', 'unit_label'],
  calcType: ['calc type', 'calculation type', 'calc_type', 'type'],
  standardHours: ['standard hours', 'standard_hours', 'hours', 'std hours'],
  standardOutputQty: [
    'standard output qty',
    'standard output quantity',
    'standard_output_qty',
    'output qty',
    'output quantity',
    'qty',
  ],
  manhoursPerUnit: [
    'manhours per unit',
    'manhours_per_unit',
    'mh per unit',
    'mh/unit',
    'weight',
    'difficulty weight',
  ],
};

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findColumnIndex(headers, aliases) {
  const set = new Set(aliases.map(normalizeHeader));
  return headers.findIndex((h) => set.has(h));
}

function normalizeCalcType(raw) {
  const v = normalizeHeader(raw);
  if (!v) return null;
  if (v === 'rate' || v === 'rate based' || v === 'rate_based') return 'rate_based';
  if (v === 'weight' || v === 'weight based' || v === 'weight_based') return 'weight_based';
  return null;
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function findHeaderRowIndex(matrix) {
  for (let i = 0; i < matrix.length; i += 1) {
    const headers = matrix[i].map(normalizeHeader);
    if (
      findColumnIndex(headers, IMPORT_HEADERS.projectName) !== -1 &&
      findColumnIndex(headers, IMPORT_HEADERS.taskName) !== -1 &&
      findColumnIndex(headers, IMPORT_HEADERS.calcType) !== -1
    ) {
      return i;
    }
  }
  return matrix.findIndex((row) => row.some((cell) => String(cell || '').trim()));
}

function parseEfficiencyWorkbookBuffer(buffer) {
  if (!buffer?.length) throw new Error('Uploaded file is empty');

  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName =
    workbook.SheetNames.find((name) => normalizeHeader(name) === 'projects') || workbook.SheetNames[0];
  if (!sheetName) throw new Error('Uploaded file has no worksheets');

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headerIndex = findHeaderRowIndex(matrix);
  if (headerIndex === -1) throw new Error('Uploaded file is empty');

  const headers = matrix[headerIndex].map(normalizeHeader);
  const columnIndex = {};
  for (const [field, aliases] of Object.entries(IMPORT_HEADERS)) {
    const idx = findColumnIndex(headers, aliases);
    if (idx !== -1) columnIndex[field] = idx;
  }

  const missing = ['projectName', 'taskName', 'calcType'].filter((f) => columnIndex[f] == null);
  if (missing.length) {
    throw new Error(
      'Missing required column(s): Project Name, Task Name, Calc Type (rate_based or weight_based)'
    );
  }

  const rows = [];
  for (let i = headerIndex + 1; i < matrix.length; i += 1) {
    const row = matrix[i];
    const projectName = String(row[columnIndex.projectName] ?? '').trim();
    const taskName = String(row[columnIndex.taskName] ?? '').trim();
    if (!projectName && !taskName) continue;
    if (!projectName || !taskName) {
      rows.push({
        rowNumber: i + 1,
        error: 'Project Name and Task Name are required',
        projectName,
        taskName,
      });
      continue;
    }

    const calcType = normalizeCalcType(row[columnIndex.calcType]);
    if (!calcType) {
      rows.push({
        rowNumber: i + 1,
        error: 'Calc Type must be rate_based or weight_based (or Rate / Weight)',
        projectName,
        taskName,
      });
      continue;
    }

    rows.push({
      rowNumber: i + 1,
      projectName,
      taskName,
      versionLabel:
        columnIndex.versionLabel != null ? String(row[columnIndex.versionLabel] ?? '').trim() : '',
      unitLabel:
        columnIndex.unitLabel != null
          ? String(row[columnIndex.unitLabel] ?? '').trim() || 'unit'
          : 'unit',
      calcType,
      standardHours:
        columnIndex.standardHours != null ? parseNumber(row[columnIndex.standardHours]) : null,
      standardOutputQty:
        columnIndex.standardOutputQty != null ? parseNumber(row[columnIndex.standardOutputQty]) : null,
      manhoursPerUnit:
        columnIndex.manhoursPerUnit != null ? parseNumber(row[columnIndex.manhoursPerUnit]) : null,
    });
  }

  if (rows.length === 0) throw new Error('No data rows found in uploaded file');
  return rows;
}

function validateImportRow(row) {
  if (row.error) return row.error;
  try {
    computeManhoursPerUnit({
      calcType: row.calcType,
      standardHours: row.standardHours,
      standardOutputQty: row.standardOutputQty,
      manhoursPerUnit: row.manhoursPerUnit,
    });
    return null;
  } catch (err) {
    return err.message;
  }
}

async function applyEfficiencyImport(pool, rows, createdBy = null) {
  const summary = {
    totalRows: rows.length,
    projectsUpserted: 0,
    baselinesUpserted: 0,
    failedRows: 0,
    errors: [],
  };

  const projectIdByName = new Map();
  const touchedProjects = new Set();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const row of rows) {
      const err = validateImportRow(row);
      if (err) {
        summary.failedRows += 1;
        summary.errors.push({ rowNumber: row.rowNumber, message: err });
        continue;
      }

      let projectId = projectIdByName.get(row.projectName);
      if (!projectId) {
        const proj = await client.query(
          `
            INSERT INTO efficiency_projects (name)
            VALUES ($1)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
          `,
          [row.projectName]
        );
        projectId = proj.rows[0].id;
        projectIdByName.set(row.projectName, projectId);
        if (!touchedProjects.has(row.projectName)) {
          touchedProjects.add(row.projectName);
          summary.projectsUpserted += 1;
        }
      }

      const manhoursPerUnit = computeManhoursPerUnit({
        calcType: row.calcType,
        standardHours: row.standardHours,
        standardOutputQty: row.standardOutputQty,
        manhoursPerUnit: row.manhoursPerUnit,
      });

      await client.query(
        `
          INSERT INTO task_baselines (
            project_id, project_name, task_name, version_label, unit_label,
            standard_output_qty, standard_hours, calc_type, manhours_per_unit, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (project_id, task_name, version_label)
          DO UPDATE SET
            project_name = EXCLUDED.project_name,
            unit_label = EXCLUDED.unit_label,
            standard_output_qty = EXCLUDED.standard_output_qty,
            standard_hours = EXCLUDED.standard_hours,
            calc_type = EXCLUDED.calc_type,
            manhours_per_unit = EXCLUDED.manhours_per_unit
        `,
        [
          projectId,
          row.projectName,
          row.taskName,
          row.versionLabel || '',
          row.unitLabel || 'unit',
          row.calcType === 'rate_based' ? row.standardOutputQty : null,
          row.calcType === 'rate_based' ? row.standardHours : null,
          row.calcType,
          manhoursPerUnit,
          createdBy,
        ]
      );
      summary.baselinesUpserted += 1;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return summary;
}

function buildImportTemplateBuffer() {
  const projectRows = [
    [
      'CALC TYPE — use exactly one of the values below in the Calc Type column for each row',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
    [
      'rate_based',
      'Rate-based: MH per unit = Standard Hours ÷ Standard Output Qty. Example: 8 hours ÷ 120 sec = 0.0667 MH/sec. Fill Standard Hours + Standard Output Qty. Leave Manhours Per Unit blank.',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
    [
      'weight_based',
      'Weight-based: MH per unit is the fixed difficulty weight per unit (e.g. Art Hard = 0.5 MH/asset). Fill Manhours Per Unit only. Leave Standard Hours + Standard Output Qty blank.',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
    ['', '', '', '', '', '', '', ''],
    [
      'Project Name',
      'Task Name',
      'Version Label',
      'Unit Label',
      'Calc Type',
      'Standard Hours',
      'Standard Output Qty',
      'Manhours Per Unit',
    ],
    [
      'Concept Videos - Animation',
      'Animation',
      'V1 Production',
      'sec',
      'rate_based',
      8,
      120,
      '',
    ],
    ['Concept Videos - Art', 'Art', 'Hard', 'asset', 'weight_based', '', '', 0.5],
    ['Pearson', 'SV Clips', '', 'clip', 'weight_based', '', '', 0.75],
    ['Zepto', 'Image Creation', 'V1', 'unit', 'rate_based', 8, 15, ''],
  ];

  const guideRows = [
    ['Calc Type', 'When to use', 'Required columns', 'Formula / rule', 'Example'],
    [
      'rate_based',
      'Output speed is measured as quantity per fixed batch of hours (production lines, animation sec/day, etc.)',
      'Standard Hours, Standard Output Qty',
      'Manhours per unit = Standard Hours ÷ Standard Output Qty',
      '8 hours for 120 sec → 8 ÷ 120 = 0.0667 MH per sec',
    ],
    [
      'weight_based',
      'Each unit has a fixed difficulty weight (Art Hard/Medium/Easy, Pearson clip types, etc.)',
      'Manhours Per Unit',
      'Manhours per unit = the weight value you enter (no division)',
      'Hard art = 0.5 MH per asset; output of 10 assets → 5 implied MHs',
    ],
    ['', '', '', '', ''],
    ['Accepted values in Calc Type column', 'rate_based, weight_based (also accepts Rate, Weight, rate based, weight based)', '', '', ''],
  ];

  const projectSheet = XLSX.utils.aoa_to_sheet(projectRows);
  projectSheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 1 }, e: { r: 1, c: 7 } },
    { s: { r: 2, c: 1 }, e: { r: 2, c: 7 } },
  ];

  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideSheet['!merges'] = [{ s: { r: 4, c: 1 }, e: { r: 4, c: 4 } }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, projectSheet, 'Projects');
  XLSX.utils.book_append_sheet(book, guideSheet, 'Calc Type Guide');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  parseEfficiencyWorkbookBuffer,
  validateImportRow,
  applyEfficiencyImport,
  buildImportTemplateBuffer,
};
