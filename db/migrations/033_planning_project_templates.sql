CREATE TABLE planning_project_templates (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80), name_key TEXT NOT NULL,
 schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1),
 document_json TEXT NOT NULL CHECK(json_valid(document_json)), source_screen_id TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','ready')), expires_at TEXT,
 request_id TEXT NOT NULL, input_hash TEXT NOT NULL,
 UNIQUE(id,project_id,workspace_id), UNIQUE(workspace_id,project_id,name_key),
 UNIQUE(workspace_id,project_id,created_by,request_id),
 FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);
CREATE INDEX planning_project_templates_scope ON planning_project_templates(workspace_id,project_id,status,created_at,id);
CREATE TABLE planning_project_template_assets (
 id TEXT PRIMARY KEY, template_id TEXT NOT NULL, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
 byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 8388608), hash TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(template_id,project_id,workspace_id) REFERENCES planning_project_templates(id,project_id,workspace_id)
);
CREATE INDEX planning_project_template_assets_scope ON planning_project_template_assets(workspace_id,project_id,template_id);
