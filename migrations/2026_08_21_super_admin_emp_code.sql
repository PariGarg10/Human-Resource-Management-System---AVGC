-- Super Admin employee code → EMP001
DO $$
DECLARE
  super_emp_id INTEGER;
BEGIN
  SELECT a.employee_id
  INTO super_emp_id
  FROM admins a
  WHERE a.is_super_admin = TRUE
  ORDER BY a.id
  LIMIT 1;

  IF super_emp_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE employees
  SET employeecode = employeecode || '_migrated'
  WHERE upper(trim(employeecode)) = 'EMP001'
    AND id <> super_emp_id;

  UPDATE employees
  SET employeecode = 'EMP001'
  WHERE id = super_emp_id;
END $$;
