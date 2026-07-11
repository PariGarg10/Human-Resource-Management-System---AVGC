-- Forgot-password / account lockout support (employees)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS temp_password_hash TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS temp_password_expiry TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_locked_until TIMESTAMPTZ;

-- Token-based password reset flow
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
