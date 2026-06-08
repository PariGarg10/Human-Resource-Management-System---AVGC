/** Matches server PORTAL_ROLES.EMPLOYEE — self-service employee portal access. */
export function hasEmployeeAccess(role?: string | null): boolean {
  const r = String(role || '')
    .toLowerCase()
    .trim();
  return r === 'employee' || r === 'it_head';
}
