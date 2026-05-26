const { normalizeProfilePhotoUrl } = require('./profilePhoto');

/**
 * Group HRMS employees into org-chart sections (flat display order).
 */
function normalizeRole(role) {
  return String(role || 'employee').toLowerCase().trim();
}

function isIntern(employee) {
  const dept = String(employee.department || '').toLowerCase();
  const code = String(employee.employeecode || '').toLowerCase();
  return dept.includes('intern') || code.includes('intern');
}

/** Founder is Ashish Mishra only (per org policy). */
function isFounder(row) {
  const name = String(row.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return name === 'ashish mishra' || name.includes('ashish mishra');
}

function personFromRow(row) {
  const department = row.department ? String(row.department).trim() : '';
  const role = normalizeRole(row.role);
  let title = department || role;
  if (role === 'manager' && department) title = department;
  else if (role === 'manager') title = 'Manager';
  else if (role === 'admin' && department) title = department;
  else if (role === 'admin') title = 'Administrator';
  else if (role === 'employee' && department) title = department;
  else if (role === 'employee') title = 'Employee';

  return {
    id: row.id,
    name: row.name,
    title,
    department: department || null,
    role,
    employeecode: row.employeecode,
    profilePhotoUrl: normalizeProfilePhotoUrl(row.profilephotourl),
  };
}

function roleLabel(role) {
  return String(role || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function buildOrgSections(employees) {
  const founder = [];
  const managers = [];
  const interns = [];
  const customRoleSections = new Map();

  for (const row of employees) {
    const person = personFromRow(row);
    const role = person.role;

    if (isFounder(row)) {
      founder.push(person);
    } else if (role === 'manager' || role === 'admin') {
      managers.push(person);
    } else if (isIntern(row)) {
      interns.push(person);
    } else if (role === 'employee' || role === 'full time employee' || role === 'full-time employee') {
      // The org/team charts intentionally do not show a Full-time Employees bucket.
      continue;
    } else {
      const sectionId = `role-${role.replace(/[^a-z0-9]+/g, '-') || 'custom'}`;
      if (!customRoleSections.has(sectionId)) {
        customRoleSections.set(sectionId, { id: sectionId, label: roleLabel(role) || 'Other Roles', people: [] });
      }
      customRoleSections.get(sectionId).people.push(person);
    }
  }

  const sortByName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  founder.sort(sortByName);
  managers.sort(sortByName);
  interns.sort(sortByName);
  for (const section of customRoleSections.values()) {
    section.people.sort(sortByName);
  }

  const sections = [
    { id: 'founder', label: 'Founder', people: founder },
    { id: 'managers', label: 'Managers', people: managers },
    ...Array.from(customRoleSections.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
    { id: 'interns', label: 'Interns', people: interns },
  ];

  return sections;
}

module.exports = { buildOrgSections, personFromRow };
