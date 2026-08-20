-- Super Admin designation → Admin (employees + admins rows)
UPDATE employees e
SET designation = 'Admin'
FROM admins a
WHERE a.is_super_admin = TRUE
  AND a.employee_id = e.id;

UPDATE admins
SET designation = 'Admin'
WHERE is_super_admin = TRUE;
