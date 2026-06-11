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

function hasStoredProfilePhoto(row) {
  if (row.has_profile_photo === true || row.has_profile_photo === 't') return true;
  const normalized = normalizeProfilePhotoUrl(row.profilephotourl);
  return Boolean(normalized);
}

function resolveEmployeePhotoUrl(row) {
  const normalized = normalizeProfilePhotoUrl(row.profilephotourl);
  if (normalized && normalized.startsWith('/uploads/profile-photos/')) {
    return normalized;
  }
  if (hasStoredProfilePhoto(row)) {
    return `/api/users/profile-photo/employee/${row.id}`;
  }
  return null;
}

function displayDesignation(row) {
  const designation = row.designation ? String(row.designation).trim() : '';
  if (designation) return designation;

  const department = row.department ? String(row.department).trim() : '';
  const role = normalizeRole(row.role);
  if (role === 'manager' && department) return department;
  if (role === 'manager') return 'Manager';
  if (role === 'admin' && department) return department;
  if (role === 'admin') return 'Administrator';
  if (department) return department;
  if (role === 'employee') return 'Employee';
  return roleLabel(role) || 'Employee';
}

function personFromRow(row) {
  const department = row.department ? String(row.department).trim() : '';
  const role = normalizeRole(row.role);
  const designation = row.designation ? String(row.designation).trim() : '';
  const title = displayDesignation(row);

  return {
    id: row.id,
    name: row.name,
    email: row.email || null,
    title,
    designation: designation || null,
    department: department || null,
    role,
    employeecode: row.employeecode || null,
    phone: row.phone || null,
    location: row.location || null,
    dateOfBirth: row.dateofbirth || null,
    bio: row.bio || null,
    profilePhotoUrl: resolveEmployeePhotoUrl(row),
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

module.exports = { buildOrgSections, personFromRow, isFounder };
