-- Rename Super Admin display name to Ashish Mishra
UPDATE admins
SET name = 'Ashish Mishra',
    designation = COALESCE(NULLIF(trim(designation), ''), 'Founder & CEO')
WHERE is_super_admin = TRUE;

UPDATE employees e
SET name = 'Ashish Mishra',
    designation = COALESCE(NULLIF(trim(e.designation), ''), 'Founder & CEO')
FROM admins a
WHERE a.is_super_admin = TRUE
  AND a.employee_id = e.id;
