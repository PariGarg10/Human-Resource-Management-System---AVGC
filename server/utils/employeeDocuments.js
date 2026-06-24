const { pool } = require('../db');

const EMPLOYEE_CATEGORIES = Object.freeze([
  'aadhar',
  'pan',
  'education',
  'work_experience',
  'cancelled_cheque',
]);

const ADMIN_CATEGORIES = Object.freeze(['payslip', 'form_16', 'appraisal_letter', 'others']);

const CATEGORY_LABELS = Object.freeze({
  aadhar: 'Aadhar card',
  pan: 'PAN card',
  education: 'Educational certificates',
  work_experience: 'Work experience',
  cancelled_cheque: 'Cancelled cheque/ Passbook',
  payslip: 'Pay slip',
  form_16: 'Form 16',
  appraisal_letter: 'Appraisal letter',
  others: 'Others',
});

let tableReady = false;

async function ensureEmployeeDocumentsTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER,
      source TEXT NOT NULL CHECK (source IN ('employee', 'admin')),
      uploaded_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON employee_documents (employee_id, created_at DESC)`
  );
  tableReady = true;
}

function mapDocumentRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    category: row.category,
    categoryLabel: CATEGORY_LABELS[row.category] || row.category,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    source: row.source,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name || null,
    createdAt: row.created_at,
  };
}

function isEmployeeCategory(category) {
  return EMPLOYEE_CATEGORIES.includes(String(category || '').trim());
}

function isAdminCategory(category) {
  return ADMIN_CATEGORIES.includes(String(category || '').trim());
}

module.exports = {
  EMPLOYEE_CATEGORIES,
  ADMIN_CATEGORIES,
  CATEGORY_LABELS,
  ensureEmployeeDocumentsTable,
  mapDocumentRow,
  isEmployeeCategory,
  isAdminCategory,
};
