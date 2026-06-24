const ORG_CHART_EMPLOYEE_SELECT = `
  SELECT id, employeecode, name, email, department, designation, role, reporting_to_id,
         profilephotourl, phone, location,
         (profile_photo IS NOT NULL) AS has_profile_photo
  FROM employees
  WHERE lower(trim(COALESCE(employment_status, 'active'))) <> 'exited'
  ORDER BY name ASC
`;

const MANAGER_ASSIGNMENTS_SELECT = 'SELECT managerid, employeeid FROM manageremployees';

async function fetchOrgChartSourceData(pool) {
  const [employeesResult, assignmentsResult] = await Promise.all([
    pool.query(ORG_CHART_EMPLOYEE_SELECT),
    pool.query(MANAGER_ASSIGNMENTS_SELECT),
  ]);
  return {
    employees: employeesResult.rows,
    assignments: assignmentsResult.rows,
  };
}

module.exports = {
  ORG_CHART_EMPLOYEE_SELECT,
  MANAGER_ASSIGNMENTS_SELECT,
  fetchOrgChartSourceData,
};
