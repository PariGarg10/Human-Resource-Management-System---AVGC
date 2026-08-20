-- Allow multiple work logs per employee/project/task/date; enable resubmit after rejection
ALTER TABLE work_logs DROP CONSTRAINT IF EXISTS work_logs_employee_id_project_id_task_baseline_id_log_date_key;
