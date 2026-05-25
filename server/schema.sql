-- AVGC HRMS PostgreSQL schema

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  employeecode TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  passwordhash TEXT NOT NULL,
  department TEXT,
  role TEXT NOT NULL DEFAULT 'employee',
  isregistered BOOLEAN NOT NULL DEFAULT TRUE,
  mustchangepassword BOOLEAN NOT NULL DEFAULT FALSE,
  dateofbirth TEXT,
  phone TEXT,
  location TEXT,
  bio TEXT,
  profilephotourl TEXT,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendancelogs (
  id SERIAL PRIMARY KEY,
  employeeid INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  punchin TIMESTAMPTZ,
  punchout TIMESTAMPTZ,
  date DATE NOT NULL,
  totalhours DOUBLE PRECISION,
  status TEXT,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employeeid, date)
);

CREATE TABLE IF NOT EXISTS manageremployees (
  id SERIAL PRIMARY KEY,
  managerid INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employeeid INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (managerid, employeeid)
);

CREATE TABLE IF NOT EXISTS leaves (
  id SERIAL PRIMARY KEY,
  employeeid INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leavetype TEXT NOT NULL,
  fromdate DATE NOT NULL,
  todate DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approvedby INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS importhistory (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  totalrows INTEGER NOT NULL,
  successfulrows INTEGER NOT NULL,
  failedrows INTEGER NOT NULL,
  createdby INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS importerrors (
  id SERIAL PRIMARY KEY,
  importid INTEGER NOT NULL REFERENCES importhistory(id) ON DELETE CASCADE,
  rownumber INTEGER NOT NULL,
  error TEXT NOT NULL,
  rowdata TEXT,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auditlogs (
  id SERIAL PRIMARY KEY,
  actorid INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  details TEXT,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  userid INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  isread BOOLEAN NOT NULL DEFAULT FALSE,
  subjectemployeeid INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  eventdate TEXT,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (userid, isread, createdat DESC);

CREATE TABLE IF NOT EXISTS concerns (
  id SERIAL PRIMARY KEY,
  raised_by INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  raised_to INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Medium',
  status TEXT NOT NULL DEFAULT 'Open',
  response TEXT,
  attachmenturl TEXT,
  responseattachmenturl TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_concerns_raised_by ON concerns (raised_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concerns_raised_to ON concerns (raised_to, status, created_at DESC);

CREATE TABLE IF NOT EXISTS saturday_config (
  date DATE PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('working', 'off')),
  created_by INTEGER NOT NULL REFERENCES employees(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saturday_config_date ON saturday_config (date);

CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  holiday_name TEXT NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('national', 'festival', 'optional')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (date)
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays (date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_unique_date ON holidays (date);

CREATE TABLE IF NOT EXISTS personal_tasks (
  id SERIAL PRIMARY KEY,
  employeeid INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Medium',
  duedate DATE NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_tasks_employee ON personal_tasks (employeeid, duedate);

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  passwordhash TEXT NOT NULL,
  designation TEXT,
  department TEXT,
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  mustchangepassword BOOLEAN NOT NULL DEFAULT FALSE,
  employee_id INTEGER UNIQUE REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_permissions (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  module_name TEXT NOT NULL,
  can_access BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (admin_id, module_name)
);

CREATE INDEX IF NOT EXISTS idx_admin_permissions_admin ON admin_permissions (admin_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('admin', 'manager', 'employee')),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_email_created ON password_reset_tokens (lower(email), created_at);
