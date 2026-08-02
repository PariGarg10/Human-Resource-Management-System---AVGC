-- Efficiency Tracking (new tables only — does not alter existing HRMS tables)

CREATE TABLE IF NOT EXISTS efficiency_projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_baselines (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES efficiency_projects(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  task_name TEXT NOT NULL,
  version_label TEXT NOT NULL DEFAULT '',
  unit_label TEXT NOT NULL DEFAULT 'unit',
  standard_output_qty NUMERIC,
  standard_hours NUMERIC,
  calc_type TEXT NOT NULL CHECK (calc_type IN ('rate_based', 'weight_based')),
  manhours_per_unit NUMERIC NOT NULL CHECK (manhours_per_unit > 0),
  created_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, task_name, version_label)
);

CREATE INDEX IF NOT EXISTS idx_task_baselines_project ON task_baselines (project_id);

CREATE TABLE IF NOT EXISTS work_logs (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES efficiency_projects(id) ON DELETE RESTRICT,
  task_baseline_id INTEGER NOT NULL REFERENCES task_baselines(id) ON DELETE RESTRICT,
  log_date DATE NOT NULL,
  employee_name TEXT NOT NULL,
  actual_output_qty NUMERIC NOT NULL CHECK (actual_output_qty > 0),
  implied_mhs NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  manager_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  manager_remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  UNIQUE (employee_id, project_id, task_baseline_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_work_logs_status_manager ON work_logs (status, manager_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_employee_date ON work_logs (employee_id, log_date);
CREATE INDEX IF NOT EXISTS idx_work_logs_approved ON work_logs (employee_id, log_date, status)
  WHERE status = 'approved';
