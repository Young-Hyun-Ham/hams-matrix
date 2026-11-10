CREATE TABLE project_database_domain_catalogs (
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id,workspace_id),
  FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);
CREATE TABLE project_database_domains (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  logical_name TEXT NOT NULL CHECK(length(logical_name) BETWEEN 1 AND 100),
  logical_key TEXT NOT NULL CHECK(length(logical_key) BETWEEN 1 AND 100),
  physical_name TEXT NOT NULL CHECK(length(physical_name) BETWEEN 1 AND 100),
  data_type TEXT NOT NULL CHECK(length(data_type) BETWEEN 1 AND 80),
  length TEXT NOT NULL DEFAULT '' CHECK(length(length) <= 40),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 1000),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);
CREATE UNIQUE INDEX idx_database_domain_logical ON project_database_domains(workspace_id,project_id,logical_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_database_domains_project ON project_database_domains(workspace_id,project_id,deleted_at,logical_key);
