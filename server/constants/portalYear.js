const MIN_PORTAL_YEAR = 2026;
const MAX_PORTAL_YEAR = 2100;

function isValidPortalYear(year) {
  return Number.isInteger(year) && year >= MIN_PORTAL_YEAR && year <= MAX_PORTAL_YEAR;
}

module.exports = { MIN_PORTAL_YEAR, MAX_PORTAL_YEAR, isValidPortalYear };
