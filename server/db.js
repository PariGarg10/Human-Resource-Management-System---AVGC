const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, '..', 'hrms.db');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employeecode TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passwordhash TEXT NOT NULL,
      department TEXT,
      role TEXT NOT NULL DEFAULT 'employee',
      isregistered INTEGER NOT NULL DEFAULT 1,
      mustchangepassword INTEGER NOT NULL DEFAULT 0,
      createdat DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendancelogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employeeid INTEGER NOT NULL,
      punchin DATETIME,
      punchout DATETIME,
      date DATE NOT NULL,
      totalhours REAL,
      status TEXT,
      createdat DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(employeeid, date),
      FOREIGN KEY(employeeid) REFERENCES employees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS manageremployees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      managerid INTEGER NOT NULL,
      employeeid INTEGER NOT NULL,
      createdat DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(managerid, employeeid),
      FOREIGN KEY(managerid) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY(employeeid) REFERENCES employees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employeeid INTEGER NOT NULL,
      leavetype TEXT NOT NULL,
      fromdate DATE NOT NULL,
      todate DATE NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      approvedby INTEGER,
      createdat DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employeeid) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY(approvedby) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS importhistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      totalrows INTEGER NOT NULL,
      successfulrows INTEGER NOT NULL,
      failedrows INTEGER NOT NULL,
      createdby INTEGER,
      createdat DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(createdby) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS importerrors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      importid INTEGER NOT NULL,
      rownumber INTEGER NOT NULL,
      error TEXT NOT NULL,
      rowdata TEXT,
      createdat DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(importid) REFERENCES importhistory(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auditlogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actorid INTEGER,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      details TEXT,
      createdat DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(actorid) REFERENCES employees(id) ON DELETE SET NULL
    );
  `);

  runMigrations();
  seedDemoEmployee();
  seedDefaultAdmin();
  seedSampleManagers();
}

function runMigrations() {
  const employeeColumns = db.prepare('PRAGMA table_info(employees)').all();
  const columnNames = new Set(employeeColumns.map((column) => column.name));

  if (!columnNames.has('role')) {
    db.exec("ALTER TABLE employees ADD COLUMN role TEXT NOT NULL DEFAULT 'employee'");
  }
  if (!columnNames.has('isregistered')) {
    db.exec('ALTER TABLE employees ADD COLUMN isregistered INTEGER NOT NULL DEFAULT 1');
  }
  if (!columnNames.has('mustchangepassword')) {
    db.exec('ALTER TABLE employees ADD COLUMN mustchangepassword INTEGER NOT NULL DEFAULT 0');
  }
  if (!columnNames.has('dateofbirth')) {
    db.exec('ALTER TABLE employees ADD COLUMN dateofbirth TEXT');
  }
  if (!columnNames.has('phone')) {
    db.exec('ALTER TABLE employees ADD COLUMN phone TEXT');
  }
  if (!columnNames.has('location')) {
    db.exec('ALTER TABLE employees ADD COLUMN location TEXT');
  }
  if (!columnNames.has('bio')) {
    db.exec('ALTER TABLE employees ADD COLUMN bio TEXT');
  }
  if (!columnNames.has('profilephotourl')) {
    db.exec('ALTER TABLE employees ADD COLUMN profilephotourl TEXT');
  }
}

function seedDemoEmployee() {
  const existing = db.prepare('SELECT id FROM employees WHERE employeecode = ?').get('EMP001');
  if (existing) {
    return;
  }

  const passwordhash = bcrypt.hashSync('password123', 10);
  db.prepare(`
    INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('EMP001', 'Demo Employee', 'emp001@example.com', passwordhash, 'Engineering', 'employee', 1, 0);
}

function seedDefaultAdmin() {
  const existing = db.prepare("SELECT id FROM employees WHERE email = ? AND role = 'admin'").get('admin@hrms.com');
  if (existing) {
    return;
  }

  const passwordhash = bcrypt.hashSync('Admin@123', 10);
  db.prepare(`
    INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('ADMIN001', 'System Admin', 'admin@hrms.com', passwordhash, 'Administration', 'admin', 1, 1);
}

function seedSampleManagers() {
  const samples = [
    { code: 'EMP900', name: 'Manager One', email: 'manager1@gmail.com', department: 'HR' },
    { code: 'EMP901', name: 'Manager Two', email: 'manager2@gmail.com', department: 'Development' }
  ];

  for (const sample of samples) {
    const existing = db.prepare("SELECT id FROM employees WHERE email = ? AND role = 'manager'").get(sample.email);
    if (existing) continue;

    const passwordhash = bcrypt.hashSync('Manager@123', 10);
    db.prepare(`
      INSERT INTO employees (employeecode, name, email, passwordhash, department, role, isregistered, mustchangepassword)
      VALUES (?, ?, ?, ?, ?, 'manager', 1, 0)
    `).run(sample.code, sample.name, sample.email, passwordhash, sample.department);
  }
}

module.exports = { db, initDatabase };
