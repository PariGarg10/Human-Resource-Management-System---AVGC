require('dotenv').config();
const { pool } = require('../db');
const { buildOrgTree, countTreePeople } = require('../utils/orgTree');

(async () => {
  const emp = await pool.query(`
    SELECT id, employeecode, name, role, designation, reporting_to_id
    FROM employees
    WHERE lower(trim(COALESCE(employment_status, 'active'))) <> 'exited'
    ORDER BY name
  `);
  const active = await pool.query(`
    SELECT id FROM employees
    WHERE COALESCE(is_active, TRUE) = TRUE
      AND lower(trim(COALESCE(employment_status, 'active'))) <> 'exited'
  `);
  const assign = await pool.query('SELECT managerid, employeeid FROM manageremployees');
  const tree = buildOrgTree(emp.rows, assign.rows);
  const visible = countTreePeople(tree);
  const inTree = new Set();
  function walk(n) {
    if (!n) return;
    inTree.add(Number(n.employeeId || n.id));
    for (const c of n.children || []) walk(c);
  }
  walk(tree);
  const missing = emp.rows.filter((r) => !inTree.has(r.id));
  console.log('all non-exited:', emp.rowCount);
  console.log('is_active true:', active.rowCount);
  console.log('in tree:', visible);
  console.log('assignments:', assign.rowCount);
  console.log('missing from tree:', missing.length);
  if (missing.length) {
    missing.forEach((r) => console.log(`  - ${r.id} ${r.name} (${r.role}) code=${r.employeecode}`));
  }

  const badReport = await pool.query(`
    SELECT e.id, e.name, e.reporting_to_id
    FROM employees e
    LEFT JOIN employees m ON m.id = e.reporting_to_id
    WHERE lower(trim(COALESCE(e.employment_status, 'active'))) <> 'exited'
      AND e.reporting_to_id IS NOT NULL
      AND m.id IS NULL
  `);
  console.log('broken reporting_to_id:', badReport.rowCount);

  const unassigned = await pool.query(`
    SELECT e.id, e.name, e.role
    FROM employees e
    WHERE lower(trim(COALESCE(e.employment_status, 'active'))) <> 'exited'
      AND e.id NOT IN (SELECT employeeid FROM manageremployees)
      AND e.reporting_to_id IS NULL
      AND lower(trim(COALESCE(e.role, ''))) NOT IN ('admin', 'founder')
    ORDER BY e.name
  `);
  console.log('no manager assignment or reporting_to_id:', unassigned.rowCount);
  unassigned.rows.slice(0, 10).forEach((r) => console.log(`  - ${r.id} ${r.name} (${r.role})`));

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
