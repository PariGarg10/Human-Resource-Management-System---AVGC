-- Super Admin profile: office@avgcstudios.com, name Super Admin
UPDATE employees e
SET name = 'Super Admin',
    designation = COALESCE(NULLIF(e.designation, ''), 'Admin')
FROM admins a
WHERE a.is_super_admin = TRUE AND a.employee_id = e.id;

UPDATE admins
SET name = 'Super Admin',
    designation = COALESCE(NULLIF(designation, ''), 'Admin')
WHERE is_super_admin = TRUE;

UPDATE employees e
SET email = 'office@avgcstudios.com'
FROM admins a
WHERE a.is_super_admin = TRUE
  AND a.employee_id = e.id
  AND NOT EXISTS (
    SELECT 1 FROM employees x
    WHERE lower(trim(x.email)) = 'office@avgcstudios.com' AND x.id <> e.id
  );

UPDATE admins a
SET email = 'office@avgcstudios.com'
WHERE a.is_super_admin = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM admins x
    WHERE lower(trim(x.email)) = 'office@avgcstudios.com' AND x.id <> a.id
  );

UPDATE employees
SET name = 'Super Admin'
WHERE lower(trim(name)) = 'ashish mishra' AND role = 'admin';

UPDATE admins
SET name = 'Super Admin'
WHERE lower(trim(name)) = 'ashish mishra';
