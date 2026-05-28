function isPlaceholder(value) {
  if (!value) return true;
  const normalized = String(value).trim().toLowerCase();
  return (
    normalized.includes('change_me') ||
    normalized.includes('change-me') ||
    normalized.includes('your_password_here') ||
    normalized.includes('postgresql://user:pass@host')
  );
}

function validateEnv() {
  const warnings = [];

  if (!process.env.DATABASE_URL || isPlaceholder(process.env.DATABASE_URL)) {
    warnings.push('DATABASE_URL is missing or still using a placeholder value.');
  }

  if (!process.env.JWT_SECRET || isPlaceholder(process.env.JWT_SECRET)) {
    warnings.push('JWT_SECRET is missing or still using a placeholder value.');
  }

  const smtpConfigured =
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    !isPlaceholder(process.env.SMTP_PASS);
  if (!smtpConfigured) {
    warnings.push('SMTP settings are incomplete; forgot-password emails may fail.');
  }

  return warnings;
}

module.exports = { validateEnv };
