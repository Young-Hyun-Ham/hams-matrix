CREATE UNIQUE INDEX idx_project_files_scope ON project_files(id,project_id,workspace_id);
CREATE TABLE project_rfp_sources (
 project_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, file_id TEXT,
 version INTEGER NOT NULL CHECK(version>=1),
 created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id),
 FOREIGN KEY(file_id,project_id,workspace_id) REFERENCES project_files(id,project_id,workspace_id) ON DELETE RESTRICT
);
CREATE TABLE project_rfp_generation_requests (
 request_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id), input_json TEXT NOT NULL CHECK(json_valid(input_json)),
 status TEXT NOT NULL CHECK(status IN ('running','stop_requested','finalizing','completed','cancelled','failed')),
 source_file_id TEXT NOT NULL, source_version INTEGER NOT NULL, source_key TEXT NOT NULL,
 source_name TEXT NOT NULL, source_size INTEGER NOT NULL, source_hash TEXT, characters INTEGER,
 model TEXT NOT NULL, guardrail_version INTEGER NOT NULL,
 document_id TEXT, document_version INTEGER, error_code INTEGER,
 created_at TEXT NOT NULL, finished_at TEXT, lease_until TEXT NOT NULL,
 FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);
CREATE UNIQUE INDEX idx_rfp_generation_active ON project_rfp_generation_requests(project_id,workspace_id)
 WHERE status IN ('running','stop_requested','finalizing');
CREATE INDEX idx_rfp_generation_user ON project_rfp_generation_requests(workspace_id,user_id,project_id,created_at);
