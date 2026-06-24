const { personFromRow } = require('./orgDirectory');
const { buildOrgTree, sortTreeAlphabetically } = require('./orgTree');

/** Every non-exited employee — same scope for all authenticated portal users. */
const DIRECTORY_EMPLOYEE_SELECT = `
  SELECT id, employeecode, name, email, department, designation, role, reporting_to_id,
         profilephotourl, phone, location, bio, date_of_joining, createdat,
         (profile_photo IS NOT NULL) AS has_profile_photo
  FROM employees
  WHERE lower(trim(COALESCE(employment_status, 'active'))) <> 'exited'
  ORDER BY name ASC
`;

function parseHobbiesFromBio(bio) {
  if (!bio) return null;
  const match = String(bio).match(/hobbies?:\s*(.+?)(?:\||\n|fun\s*fact|$)/i);
  return match?.[1]?.trim() || null;
}

function isCoparentNode(node) {
  return node && node.type === 'coparent';
}

function entryFromRow(row, depth) {
  const mapped = personFromRow(row);
  return {
    id: row.id,
    name: row.name,
    email: mapped.email || null,
    designation: mapped.designation?.trim() || mapped.title || '—',
    department: mapped.department || null,
    employeecode: row.employeecode || null,
    phone: row.phone || null,
    location: mapped.location || null,
    dateOfJoining: mapped.dateOfJoining || null,
    hobbies: parseHobbiesFromBio(row.bio) || '—',
    profilePhotoUrl: mapped.profilePhotoUrl,
    depth,
  };
}

function sortByName(a, b) {
  return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
}

function flattenOrgTree(node, byId, list = [], depth = 0) {
  if (!node) return list;

  if (!isCoparentNode(node)) {
    const empId = node.employeeId != null ? Number(node.employeeId) : Number(node.id);
    const row = Number.isFinite(empId) ? byId.get(empId) : null;
    if (row) {
      list.push(entryFromRow(row, depth));
    }

    for (const child of node.children || []) {
      if (isCoparentNode(child)) {
        for (const coparentChild of child.children || []) {
          flattenOrgTree(coparentChild, byId, list, depth + 1);
        }
      } else {
        flattenOrgTree(child, byId, list, depth + 1);
      }
    }
  }

  return list;
}

function buildEmployeeDirectory(employeeRows, assignmentRows) {
  const rows = employeeRows || [];
  if (!rows.length) return [];

  const byId = new Map(rows.map((row) => [row.id, row]));
  const tree = buildOrgTree(rows, assignmentRows);
  const orderMeta = new Map();

  if (tree) {
    const hierarchical = flattenOrgTree(sortTreeAlphabetically(tree), byId);
    hierarchical.forEach((entry, index) => {
      orderMeta.set(entry.id, { order: index, depth: entry.depth });
    });
  }

  return rows
    .map((row) => {
      const meta = orderMeta.get(row.id);
      return entryFromRow(row, meta?.depth ?? 0);
    })
    .sort((a, b) => {
      const orderA = orderMeta.get(a.id)?.order;
      const orderB = orderMeta.get(b.id)?.order;
      if (orderA != null && orderB != null && orderA !== orderB) return orderA - orderB;
      if (orderA != null && orderB == null) return -1;
      if (orderA == null && orderB != null) return 1;
      return sortByName(a, b);
    });
}

module.exports = { buildEmployeeDirectory, parseHobbiesFromBio, DIRECTORY_EMPLOYEE_SELECT };
