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
  return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
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
  const founderCeo = rows.find((row) => {
    if (!isFounder(row)) return false;
    const designation = String(row.designation || '').toLowerCase();
    return designation.includes('founder') && designation.includes('ceo');
  });
  if (founderCeo) return founderCeo;

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

function buildEmployeeToManagerMap(assignmentRows) {
  const employeeToManager = new Map();
  for (const link of assignmentRows || []) {
    const managerId = Number(link.managerid);
    const employeeId = Number(link.employeeid);
    if (!Number.isFinite(managerId) || !Number.isFinite(employeeId)) continue;
    employeeToManager.set(employeeId, managerId);
  }
  return employeeToManager;
}

function resolveParentId(row, rootId, employeeToManager, byId) {
  if (!row || row.id === rootId) return null;

  let parentId = employeeToManager.get(row.id);
  if (parentId == null || parentId === row.id) {
    parentId = row.reporting_to_id != null ? Number(row.reporting_to_id) : null;
  }
  if (!Number.isFinite(parentId) || parentId <= 0 || parentId === row.id) {
    parentId = rootId;
  }
  if (!byId.has(parentId)) {
    parentId = rootId;
  }
  return parentId;
}

function buildChildrenMap(rows, rootId, employeeToManager, byId) {
  const childrenOf = new Map();
  for (const row of rows) {
    const parentId = resolveParentId(row, rootId, employeeToManager, byId);
    if (parentId == null) continue;
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId).push(row.id);
  }
  for (const [, childIds] of childrenOf.entries()) {
    childIds.sort((a, b) => sortByName(byId.get(a), byId.get(b)));
  }
  return childrenOf;
}

function buildNode(personId, rootId, byId, childrenOf, ancestry = new Set()) {
  const row = byId.get(personId);
  if (!row) return null;

  const node = toOrgPerson(row, rootId);
  if (ancestry.has(personId)) {
    return node;
  }

  const nextAncestry = new Set(ancestry);
  nextAncestry.add(personId);
  const childIds = childrenOf.get(personId) || [];
  node.children = childIds.map((id) => buildNode(id, rootId, byId, childrenOf, nextAncestry)).filter(Boolean);
  return node;
}

function countTreePeople(node) {
  if (!node) return 0;
  let count = 1;
  for (const child of node.children || []) {
    count += countTreePeople(child);
  }
  return count;
}

/**
 * Build org chart tree from HRMS roles, manager assignments, and reporting_to_id.
 * Every non-exited employee appears exactly once.
 */
function collectPersonIds(node, ids = new Set()) {
  if (!node) return ids;
  if (node.type === 'coparent') {
    for (const child of node.children || []) collectPersonIds(child, ids);
    return ids;
  }
  const id = Number(node.employeeId ?? node.id);
  if (Number.isFinite(id)) ids.add(id);
  for (const child of node.children || []) collectPersonIds(child, ids);
  return ids;
}

function buildOrgTree(employeeRows, assignmentRows) {
  const rows = employeeRows || [];
  if (!rows.length) return null;

  const byId = new Map(rows.map((row) => [row.id, row]));
  const employeeToManager = buildEmployeeToManagerMap(assignmentRows);
  const rootRow = pickRootRow(rows);
  const rootId = rootRow.id;
  const childrenOf = buildChildrenMap(rows, rootId, employeeToManager, byId);

  const placed = new Set([rootId]);
  for (const row of rows) {
    if (row.id === rootId) continue;
    const parentId = resolveParentId(row, rootId, employeeToManager, byId);
    if (parentId != null) placed.add(row.id);
  }
  for (const row of rows) {
    if (row.id === rootId || placed.has(row.id)) continue;
    if (!childrenOf.has(rootId)) childrenOf.set(rootId, []);
    childrenOf.get(rootId).push(row.id);
  }

  return buildNode(rootId, rootId, byId, childrenOf, new Set());
}

function isCoparentNode(node) {
  return node && node.type === 'coparent';
}

function isOrgPersonNode(node) {
  return node && !isCoparentNode(node);
}

function sortTreeAlphabetically(node) {
  if (!node || !Array.isArray(node.children)) return node;
  const people = node.children.filter(isOrgPersonNode).sort(sortByName).map((child) => sortTreeAlphabetically(child));
  const coparents = node.children.filter(isCoparentNode);
  node.children = [...people, ...coparents];
  return node;
}

function buildManagerTeamsMap(assignmentRows) {
  const managerTeams = new Map();
  for (const link of assignmentRows || []) {
    const managerId = Number(link.managerid);
    const employeeId = Number(link.employeeid);
    if (!Number.isFinite(managerId) || !Number.isFinite(employeeId)) continue;
    const list = managerTeams.get(managerId) || [];
    list.push(employeeId);
    managerTeams.set(managerId, list);
  }
  return managerTeams;
}

function getDirectReportIds(personId, rows, managerTeams) {
  const ids = new Set();
  for (const row of rows) {
    if (row.reporting_to_id === personId) ids.add(row.id);
  }
  for (const empId of managerTeams.get(personId) || []) {
    ids.add(empId);
  }
  return [...ids];
}

function getDirectManagerRow(viewer, rows, managerTeams) {
  for (const [managerId, employeeIds] of managerTeams.entries()) {
    if (employeeIds.includes(viewer.id)) {
      const manager = rows.find((row) => row.id === managerId);
      if (manager) return manager;
    }
  }
  if (viewer.reporting_to_id) {
    const manager = rows.find((row) => row.id === Number(viewer.reporting_to_id));
    if (manager) return manager;
  }
  return null;
}

function buildPersonSubtree(row, rows, managerTeams, rootId, visiting = new Set()) {
  if (!row || visiting.has(row.id)) return null;
  visiting.add(row.id);

  const node = toOrgPerson(row, rootId);
  const childRows = getDirectReportIds(row.id, rows, managerTeams)
    .map((id) => rows.find((r) => r.id === id))
    .filter(Boolean)
    .sort(sortByName);

  node.children = childRows
    .map((child) => buildPersonSubtree(child, rows, managerTeams, rootId, visiting))
    .filter(Boolean);

  return node;
}

/**
 * Show only: direct manager (one up), self, and full subtree below self.
 */
function scopeOrgTreeForViewer(fullTree, employeeRows, viewerEmployeeId, assignmentRows = []) {
  const viewerId = Number(viewerEmployeeId);
  if (!Number.isFinite(viewerId) || !employeeRows?.length) return fullTree;

  const rows = employeeRows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const viewer = byId.get(viewerId);
  if (!viewer) return fullTree;

  const rootId = Number(fullTree?.employeeId || fullTree?.id) || viewerId;
  const managerTeams = buildManagerTeamsMap(assignmentRows);

  const selfNode = buildPersonSubtree(viewer, rows, managerTeams, rootId);
  if (!selfNode) return fullTree;

  const managerRow = getDirectManagerRow(viewer, rows, managerTeams);
  if (!managerRow) {
    return sortTreeAlphabetically(selfNode);
  }

  const managerNode = toOrgPerson(managerRow, rootId);
  managerNode.children = [selfNode];
  return sortTreeAlphabetically(managerNode);
}

module.exports = {
  buildOrgTree,
  scopeOrgTreeForViewer,
  sortTreeAlphabetically,
  buildManagerTeamsMap,
  getDirectReportIds,
  getDirectManagerRow,
  buildPersonSubtree,
  toOrgPerson,
  countTreePeople,
  collectPersonIds,
  resolveParentId,
};
