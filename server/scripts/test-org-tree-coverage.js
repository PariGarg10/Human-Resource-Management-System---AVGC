const { buildOrgTree, countTreePeople } = require('../utils/orgTree');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const rows = [
  { id: 1, name: 'Ashish Mishra', role: 'admin', designation: 'Founder & CEO', employeecode: '1' },
  { id: 2, name: 'Manager A', role: 'manager', designation: 'Manager', employeecode: '2', reporting_to_id: 1 },
  { id: 3, name: 'Manager B', role: 'manager', designation: 'Manager', employeecode: '3', reporting_to_id: 2 },
  { id: 4, name: 'Emp One', role: 'employee', designation: 'Dev', employeecode: '100' },
  { id: 5, name: 'Emp Two', role: 'employee', designation: 'Dev', employeecode: '101' },
  { id: 6, name: 'Emp Three', role: 'employee', designation: 'Dev', employeecode: '102', reporting_to_id: null },
  { id: 7, name: 'Admin Ops', role: 'admin', designation: 'HR Admin', employeecode: '7', reporting_to_id: 2 },
];

const assignments = [
  { managerid: 2, employeeid: 4 },
  { managerid: 2, employeeid: 5 },
  { managerid: 3, employeeid: 6 },
  { managerid: 1, employeeid: 7 },
];

const tree = buildOrgTree(rows, assignments);
const visible = countTreePeople(tree);
const expected = rows.length - 0; // no duplicate root names

assert(visible === expected, `Expected ${expected} people in tree, got ${visible}`);
assert(countTreePeople(tree) >= 7, 'Tree should include all employees');

console.log('org tree coverage test passed:', visible, 'nodes');
