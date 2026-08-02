-- Manual Work days (WDs) overrides for efficiency reporting periods

CREATE TABLE IF NOT EXISTS efficiency_wd_overrides (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  wd NUMERIC NOT NULL CHECK (wd >= 0),
  updated_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, period_from, period_to)
);

CREATE INDEX IF NOT EXISTS idx_efficiency_wd_overrides_employee
  ON efficiency_wd_overrides (employee_id, period_from, period_to);
