-- Optional employee remarks when logging daily output
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS remarks TEXT;
