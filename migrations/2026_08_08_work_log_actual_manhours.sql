ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS actual_manhours_spent NUMERIC CHECK (actual_manhours_spent IS NULL OR actual_manhours_spent >= 0);
