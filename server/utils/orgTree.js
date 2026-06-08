const { personFromRow, isFounder } = require('./orgDirectory');
const { isTeamLeadDesignation } = require('./teamLeads');
const { normalizeRole, isAdminRole, isManagerRole } = require('../constants/roles');

function isIntern(row) {
  const dept = String(row.department || '').toLowerCase();
  const code = String(row.employeecode || '').toLowerCase();
  const role = normalizeRole(row.role);
  return dept.includes('intern') || code.includes('intern') || role.includes('intern');
}

function sortByName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
}

function normalizePersonName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Founder root and duplicate admin rows (e.g. Ashish Mishra / Administration) are one person. */
function isDuplicateOfRoot(row, rootRow) {
  if (!row || !rootRow) return false;
  if (row.id === rootRow.id) return true;
  return normalizePersonName(row.name) === normalizePersonName(rootRow.name);
}

function rootPriority(row) {
  const designation = String(row?.designation || '').toLowerCase();
  let score = 0;
  if (designation.includes('founder')) score += 8;
  if (designation.includes('ceo')) score += 6;
  if (designation.includes('chief executive officer')) score += 6;
  if (designation.includes('administration')) score -= 3;
  if (isAdminRole(row?.role)) score += 2;
  return score;
}

function pickRootRow(rows) {
  const founderMatches = rows.filter((row) => isFounder(row));
  if (founderMatches.length > 0) {
    return founderMatches.sort((a, b) => rootPriority(b) - rootPriority(a) || a.id - b.id)[0];
  }
  return (
    rows.find((row) => isAdminRole(row.role) && !row.reporting_to_id) ||
    rows.find((row) => isManagerRole(row.role) && !row.reporting_to_id) ||
    rows[0]
  );
}

function inferLevel(row, rootId) {
  if (row.id === rootId || isFounder(row)) return 'root';
  const role = normalizeRole(row.role);
  const designation = String(row.designation || '').toLowerCase();

  if (isTeamLeadDesignation(row.designation)) return 'lead';
  if (role === 'manager') return 'manager';
  if (isIntern(row)) return 'intern';
  if (designation.includes('director')) return 'director';
  if (
    designation.includes('coo') ||
    designation.includes('ceo') ||
    designation.includes('chief') ||
    designation.includes('founder')
  ) {
    return 'c-suite';
  }
  if (isAdminRole(role)) return 'c-suite';
  return 'intern';
}

function toOrgPerson(row, rootId) {
  const mapped = personFromRow(row);
  return {
    id: String(row.id),
    employeeId: row.id,
    name: row.name,
    title: mapped.designation?.trim() || mapped.title || row.role,
    level: inferLevel(row, rootId),
    photo: mapped.profilePhotoUrl || null,
    status: 'online',
    skills: [],
    tags: row.employeecode ? [String(row.employeecode)] : [],
    children: [],
  };
}

function buildManagerTeam(managerRow, assigneeRows, byId, placed, rootId) {
  const node = toOrgPerson(managerRow, rootId);
  const teamLeads = assigneeRows.filter((row) => isTeamLeadDesignation(row.designation)).sort(sortByName);
  const others = assigneeRows.filter((row) => !isTeamLeadDesignation(row.designation));
  const claimed = new Set();

  for (const leadRow of teamLeads) {
    if (placed.has(leadRow.id)) continue;
    placed.add(leadRow.id);
    const leadNode = toOrgPerson(leadRow, rootId);
    const reports = others
      .filter((row) => row.reporting_to_id === leadRow.id)
      .sort(sortByName);
    for (const report of reports) {
      if (placed.has(report.id)) continue;
      placed.add(report.id);
      claimed.add(report.id);
      leadNode.children.push(toOrgPerson(report, rootId));
    }
    node.children.push(leadNode);
  }

  for (const empRow of others.sort(sortByName)) {
    if (placed.has(empRow.id) || claimed.has(empRow.id)) continue;
    placed.add(empRow.id);
    node.children.push(toOrgPerson(empRow, rootId));
  }

  return node;
}

/**
 * Build org chart tree from HRMS roles, manager assignments, and reporting_to_id.
 */
function buildOrgTree(employeeRows, assignmentRows) {
  const rows = employeeRows || [];
  if (!rows.length) return null;

  const byId = new Map(rows.map((row) => [row.id, row]));
  const managerTeams = new Map();
  for (const link of assignmentRows || []) {
    const managerId = Number(link.managerid);
    const employeeId = Number(link.employeeid);
    if (!Number.isFinite(managerId) || !Number.isFinite(employeeId)) continue;
    const list = managerTeams.get(managerId) || [];
    list.push(employeeId);
    managerTeams.set(managerId, list);
  }

  let rootRow = pickRootRow(rows);

  const rootId = rootRow.id;
  const root = toOrgPerson(rootRow, rootId);
  const placed = new Set([rootId]);

  const topNodes = rows
    .filter((row) => {
      if (row.id === rootId || isDuplicateOfRoot(row, rootRow)) return false;
      const reportsToRoot = !row.reporting_to_id || row.reporting_to_id === rootId;
      if (!reportsToRoot) return false;
      return isManagerRole(row.role) || isAdminRole(row.role) || isTeamLeadDesignation(row.designation);
    })
    .sort(sortByName);

  for (const row of topNodes) {
    if (placed.has(row.id)) continue;
    placed.add(row.id);

    const assigneeIds = managerTeams.get(row.id) || [];
    const assigneeRows = assigneeIds.map((id) => byId.get(id)).filter(Boolean);

    if (isManagerRole(row.role) || assigneeRows.length > 0) {
      root.children.push(buildManagerTeam(row, assigneeRows, byId, placed, rootId));
      continue;
    }

    root.children.push(toOrgPerson(row, rootId));
  }

  for (const [managerId, employeeIds] of managerTeams.entries()) {
    if (placed.has(managerId)) continue;
    const managerRow = byId.get(managerId);
    if (!managerRow || !isManagerRole(managerRow.role) || isDuplicateOfRoot(managerRow, rootRow)) continue;
    placed.add(managerId);
    const assigneeRows = employeeIds.map((id) => byId.get(id)).filter(Boolean);
    root.children.push(buildManagerTeam(managerRow, assigneeRows, byId, placed, rootId));
  }

  for (const row of rows.sort(sortByName)) {
    if (placed.has(row.id) || isDuplicateOfRoot(row, rootRow)) continue;
    const parentId = row.reporting_to_id;
    if (!parentId || !byId.has(parentId)) continue;

    function attachUnder(node, targetId, childNode) {
      if (Number(node.employeeId) === targetId) {
        node.children.push(childNode);
        return true;
      }
      for (const child of node.children) {
        if (attachUnder(child, targetId, childNode)) return true;
      }
      return false;
    }

    const childNode = toOrgPerson(row, rootId);
    if (attachUnder(root, parentId, childNode)) {
      placed.add(row.id);
    }
  }

  for (const row of rows.sort(sortByName)) {
    if (placed.has(row.id) || isDuplicateOfRoot(row, rootRow)) continue;
    placed.add(row.id);
    root.children.push(toOrgPerson(row, rootId));
  }

  return root;
}

module.exports = { buildOrgTree };
