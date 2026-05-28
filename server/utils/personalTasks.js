const { pool } = require('../db');

const PRIORITIES = new Set(['High', 'Medium', 'Low']);
let tableReady = false;

async function ensurePersonalTasksTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS personal_tasks (
      id SERIAL PRIMARY KEY,
      employeeid INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Medium',
      duedate DATE NOT NULL,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      createdat TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_personal_tasks_employee
    ON personal_tasks (employeeid, duedate)
  `);
  tableReady = true;
}

/** Normalize DB/API values to YYYY-MM-DD (pg may return Date objects). */
function formatDueDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseDueDateInput(input) {
  if (input == null || input === '') return null;
  const raw = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function rowToTask(row) {
  const due =
    formatDueDate(row.duedate) ||
    formatDueDate(row.dueDate) ||
    formatDueDate(row.createdat) ||
    new Date().toISOString().slice(0, 10);
  return {
    id: String(row.id),
    title: row.title,
    priority: row.priority,
    dueDate: due,
    done: Boolean(row.done),
  };
}

module.exports = {
  ensurePersonalTasksTable,
  rowToTask,
  PRIORITIES,
  formatDueDate,
  parseDueDateInput,
};
