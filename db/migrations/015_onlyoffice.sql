ALTER TABLE project_files ADD COLUMN editor_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE project_files ADD COLUMN previous_editor_key TEXT;
ALTER TABLE project_files ADD COLUMN updated_at TEXT;
