CREATE TABLE IF NOT EXISTS project_folders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(id,project_id,workspace_id),
  FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id),
  FOREIGN KEY(parent_id,project_id,workspace_id) REFERENCES project_folders(id,project_id,workspace_id),
  FOREIGN KEY(workspace_id,created_by) REFERENCES workspace_members(workspace_id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_folders_siblings
  ON project_folders(workspace_id,project_id,COALESCE(parent_id,''),name);
CREATE TABLE IF NOT EXISTS project_files (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  folder_id TEXT,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 255),
  object_key TEXT NOT NULL UNIQUE,
  byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 20971520),
  mime_type TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id),
  FOREIGN KEY(folder_id,project_id,workspace_id) REFERENCES project_folders(id,project_id,workspace_id),
  FOREIGN KEY(workspace_id,created_by) REFERENCES workspace_members(workspace_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_files_folder ON project_files(workspace_id,project_id,folder_id,created_at);
