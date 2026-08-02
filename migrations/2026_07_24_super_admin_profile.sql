-- Super Admin profile: Ashish Mishra, Founder & CEO, employee code 1001
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
  WHERE employeecode = '1001'
    AND id <> super_emp_id;

  UPDATE admins
  SET name = 'Ashish Mishra',
      designation = 'Founder & CEO'
  WHERE is_super_admin = TRUE;

  UPDATE employees
  SET name = 'Ashish Mishra',
      designation = 'Founder & CEO',
      employeecode = '1001'
  WHERE id = super_emp_id;
END $$;
