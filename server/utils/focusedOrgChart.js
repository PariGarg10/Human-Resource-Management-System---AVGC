const { personFromRow } = require('./orgDirectory');
const {
  buildOrgTree,
  scopeOrgTreeForViewer,
  buildManagerTeamsMap,
  getDirectManagerRow,
  getDirectReportIds,
} = require('./orgTree');

function sortByName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
}

function toFocusedCard(row) {
  const mapped = personFromRow(row);
  return {
    id: row.id,
    name: row.name,
    designation: mapped.designation || mapped.title || null,
    department: mapped.department || null,
    avatar: mapped.profilePhotoUrl || null,
  };
}

function buildReportsList(personId, rows, managerTeams, visiting = new Set()) {
  if (visiting.has(personId)) return [];
  visiting.add(personId);

  const childRows = getDirectReportIds(personId, rows, managerTeams)
    .map((id) => rows.find((row) => row.id === id))
    .filter(Boolean)
    .sort(sortByName);

  return childRows.map((row) => {
    const card = toFocusedCard(row);
    card.reports = buildReportsList(row.id, rows, managerTeams, visiting);
    return card;
  });
}

/**
 * Person-centric org chart: manager (one up), self, and full subtree below self.
 */
function buildFocusedOrgChart(employeeId, employeeRows, assignmentRows = []) {
  const viewerId = Number(employeeId);
  if (!Number.isFinite(viewerId) || !employeeRows?.length) return null;

  const rows = employeeRows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const viewer = byId.get(viewerId);
  if (!viewer) return null;

  const managerTeams = buildManagerTeamsMap(assignmentRows);
  const fullTree = buildOrgTree(rows, assignmentRows);
  const tree = scopeOrgTreeForViewer(fullTree, rows, viewerId, assignmentRows);

  const managerRow = getDirectManagerRow(viewer, rows, managerTeams);

  return {
    manager: managerRow ? toFocusedCard(managerRow) : null,
    self: toFocusedCard(viewer),
    directReports: buildReportsList(viewerId, rows, managerTeams, new Set([viewerId])),
    tree,
  };
}

module.exports = { buildFocusedOrgChart, toFocusedCard };
