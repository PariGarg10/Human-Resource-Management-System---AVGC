-- AVGC HRMS PostgreSQL schema

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  employeecode TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  passwordhash TEXT NOT NULL,
  temp_password_hash TEXT,
  force_password_change BOOLEAN NOT NULL DEFAULT FALSE,
  temp_password_expiry TIMESTAMPTZ,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  account_locked_until TIMESTAMPTZ,
  department TEXT,
  designation TEXT,
  reporting_to_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
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
  reporting_to_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_entitlements (
  id SERIAL PRIMARY KEY,
  leave_type TEXT NOT NULL,
  allotted_days NUMERIC(8,2) NOT NULL CHECK (allotted_days >= 0),
  period TEXT NOT NULL CHECK (period IN ('monthly', 'quarterly', 'yearly')),
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_entitlements_org
  ON leave_entitlements (lower(trim(leave_type)), period)
  WHERE employee_id IS NULL AND is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_entitlements_employee
  ON leave_entitlements (employee_id, lower(trim(leave_type)), period)
  WHERE employee_id IS NOT NULL AND is_active = TRUE;

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

CREATE TABLE IF NOT EXISTS import_attendance_records (
  id SERIAL PRIMARY KEY,
  importid INTEGER NOT NULL REFERENCES importhistory(id) ON DELETE CASCADE,
  employeeid INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (importid, employeeid, date)
);

CREATE INDEX IF NOT EXISTS idx_import_attendance_records_import
  ON import_attendance_records (importid);

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
  awaiting_reply_from INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_concerns_raised_by ON concerns (raised_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concerns_raised_to ON concerns (raised_to, status, created_at DESC);

CREATE TABLE IF NOT EXISTS concern_messages (
  id SERIAL PRIMARY KEY,
  concern_id INTEGER NOT NULL REFERENCES concerns(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  attachmenturl TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concern_messages_concern ON concern_messages (concern_id, created_at ASC);

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

CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_allocations (
  id SERIAL PRIMARY KEY,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_allocations_item ON asset_allocations (inventory_item_id, status);
CREATE INDEX IF NOT EXISTS idx_asset_allocations_employee ON asset_allocations (employee_id, status);

CREATE TABLE IF NOT EXISTS policy_documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('policy', 'link')),
  file_url TEXT,
  external_url TEXT,
  uploaded_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_documents_visible ON policy_documents (is_visible, created_at DESC);

CREATE TABLE IF NOT EXISTS live_activity_links (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  created_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_activity_links_active
  ON live_activity_links (is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS live_activity_nominations (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('mvp', 'team_lead')),
  nominator_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  nominee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category, nominator_id, nominee_id)
);

CREATE INDEX IF NOT EXISTS idx_live_activity_nominations_category
  ON live_activity_nominations (category, nominee_id);

CREATE TABLE IF NOT EXISTS live_activity_winners (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('mvp', 'team_lead')),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  message TEXT,
  announced_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_activity_winners_active
  ON live_activity_winners (category, is_active, created_at DESC);

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
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee
  ON employee_documents (employee_id, created_at DESC);

CREATE TABLE IF NOT EXISTS homepage_recognition (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('top_performer', 'team_lead', 'employee')),
  name TEXT NOT NULL,
  designation TEXT NOT NULL,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homepage_recognition_category
  ON homepage_recognition (category, is_visible, sort_order, created_at);

CREATE TABLE IF NOT EXISTS social_posts (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('artwork', 'board', 'gaming')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  author_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  media_url TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT 'text',
  reject_reason TEXT,
  reactions JSONB NOT NULL DEFAULT '{}',
  comments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_post_user_reactions (
  post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, employee_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_author ON social_posts (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_tournaments (
  id SERIAL PRIMARY KEY,
  game_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  winner_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  winner_name TEXT,
  winner_score DOUBLE PRECISION,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_tournament_scores (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES social_tournaments(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_social_tournaments_status ON social_tournaments (status, game_id);
