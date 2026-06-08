/** Identify team leads by job designation (admin-controlled). */

function normalizeDesignation(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isTeamLeadDesignation(designation) {
  const d = normalizeDesignation(designation);
  if (!d) return false;
  return (
    d.includes('team lead') ||
    d.includes('team leader') ||
    d.includes('team-lead') ||
    d === 'tl' ||
    d.startsWith('tl ') ||
    d.endsWith(' tl')
  );
}

const TEAM_LEAD_SQL = `
  (
    lower(trim(COALESCE(designation, ''))) LIKE '%team lead%'
    OR lower(trim(COALESCE(designation, ''))) LIKE '%team leader%'
    OR lower(trim(COALESCE(designation, ''))) LIKE '%team-lead%'
    OR lower(trim(COALESCE(designation, ''))) = 'tl'
  )
`;

module.exports = {
  normalizeDesignation,
  isTeamLeadDesignation,
  TEAM_LEAD_SQL,
};
