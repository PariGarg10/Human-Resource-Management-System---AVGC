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
    profilePhotoUrl: row.profilephotourl || null,
  };
}

function buildOrgSections(employees) {
  const founder = [];
  const managers = [];
  const fulltime = [];
  const interns = [];

  for (const row of employees) {
    const person = personFromRow(row);
    const role = person.role;

    if (isFounder(row)) {
      founder.push(person);
    } else if (role === 'manager' || role === 'admin') {
      managers.push(person);
    } else if (isIntern(row)) {
      interns.push(person);
    } else if (role === 'employee') {
      fulltime.push(person);
    } else {
      fulltime.push(person);
    }
  }

  const sortByName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  founder.sort(sortByName);
  managers.sort(sortByName);
  fulltime.sort(sortByName);
  interns.sort(sortByName);

  const sections = [
    { id: 'founder', label: 'Founder', people: founder },
    { id: 'managers', label: 'Managers', people: managers },
    { id: 'fulltime', label: 'Full-time Employees', people: fulltime },
    { id: 'interns', label: 'Interns', people: interns },
  ];

  return sections;
}

module.exports = { buildOrgSections, personFromRow };
