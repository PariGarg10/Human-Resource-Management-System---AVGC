-- Attendance regularization requests + asset_id on inventory

CREATE TABLE IF NOT EXISTS attendance_regularization_requests (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('regularize', 'regularize_and_leave')),
  reason TEXT,
  leave_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_reg_employee_date
  ON attendance_regularization_requests (employee_id, attendance_date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_reg_status
  ON attendance_regularization_requests (status, created_at DESC);

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS asset_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_asset_id
  ON inventory_items (lower(trim(asset_id))) WHERE asset_id IS NOT NULL AND trim(asset_id) <> '';
