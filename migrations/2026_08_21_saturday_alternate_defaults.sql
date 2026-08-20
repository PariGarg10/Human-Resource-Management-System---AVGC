-- Clear legacy Saturday overrides (often all marked "off") so alternate defaults apply:
-- 1st, 3rd, 5th Saturday = working; 2nd, 4th = off.
DELETE FROM saturday_config;
