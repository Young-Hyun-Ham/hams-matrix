-- Preserve all columns, rows, constraints and indexes; only rename the table.
ALTER TABLE app_settings RENAME TO admin_setting;
