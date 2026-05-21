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

function rowToTask(row) {
  return {
    id: String(row.id),
    title: row.title,
    priority: row.priority,
    dueDate: row.duedate,
    done: Boolean(row.done),
  };
}

module.exports = { ensurePersonalTasksTable, rowToTask, PRIORITIES };
