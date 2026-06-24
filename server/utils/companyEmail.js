const AVGC_COMPANY_EMAIL_DOMAIN = 'avgcstudios.com';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function emailLocalPart(email) {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return '';
  return normalized.slice(0, at);
}

function toCompanyEmail(email) {
  const local = emailLocalPart(email);
  if (!local) return '';
  return `${local}@${AVGC_COMPANY_EMAIL_DOMAIN}`;
}

function isCompanyEmail(email) {
  return normalizeEmail(email).endsWith(`@${AVGC_COMPANY_EMAIL_DOMAIN}`);
}

/** Password-reset emails always go to the AVGC work address, not personal Gmail. */
function passwordResetDeliveryEmail(registeredEmail) {
  return toCompanyEmail(registeredEmail) || normalizeEmail(registeredEmail);
}

/** Match login / registered email or the same id @avgcstudios.com */
const EMAIL_LOOKUP_WHERE = `
  lower(trim(email)) = $1
  OR lower(split_part(trim(email), '@', 1) || '@${AVGC_COMPANY_EMAIL_DOMAIN}') = $1
`;

module.exports = {
  AVGC_COMPANY_EMAIL_DOMAIN,
  normalizeEmail,
  emailLocalPart,
  toCompanyEmail,
  isCompanyEmail,
  passwordResetDeliveryEmail,
  EMAIL_LOOKUP_WHERE,
};
