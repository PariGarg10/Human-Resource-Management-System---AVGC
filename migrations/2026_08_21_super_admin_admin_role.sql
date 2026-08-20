-- Linked Super Admin employee rows should use admin role (not manager).
UPDATE employees e
SET role = 'admin'
FROM admins a
WHERE a.employee_id = e.id
  AND a.is_super_admin = TRUE
  AND a.is_active = TRUE
  AND e.role IS DISTINCT FROM 'admin';
