PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 2000),
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '진행 중',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(id,workspace_id),
  FOREIGN KEY(workspace_id,created_by) REFERENCES workspace_members(workspace_id,user_id)
);
CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(project_id,user_id),
  FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id),
  FOREIGN KEY(workspace_id,user_id) REFERENCES workspace_members(workspace_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_projects_workspace_time ON projects(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(workspace_id,user_id,project_id);
