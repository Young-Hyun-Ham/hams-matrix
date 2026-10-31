CREATE TABLE project_permission_policies (
 project_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(project_id,workspace_id), FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);
CREATE TABLE project_role_tab_permissions (
 project_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
 tab_key TEXT NOT NULL CHECK(tab_key IN ('overview','rfp','wbs','architecture','requirement','screen','database','program','test','trace','acceptance','history','export','documents')),
 can_create INTEGER NOT NULL CHECK(can_create IN (0,1)), can_read INTEGER NOT NULL DEFAULT 1 CHECK(can_read=1),
 can_update INTEGER NOT NULL CHECK(can_update IN (0,1)), can_delete INTEGER NOT NULL CHECK(can_delete IN (0,1)),
 PRIMARY KEY(project_id,role,tab_key),
 FOREIGN KEY(project_id,workspace_id) REFERENCES project_permission_policies(project_id,workspace_id),
 CHECK(role!='viewer' OR (can_create=0 AND can_update=0 AND can_delete=0)),
 CHECK(role!='admin' OR tab_key!='rfp' OR (can_create=0 AND can_update=0 AND can_delete=0)),
 CHECK(role!='member' OR tab_key NOT IN ('rfp','wbs','architecture') OR (can_create=0 AND can_update=0 AND can_delete=0))
);
INSERT INTO project_permission_policies(project_id,workspace_id,updated_by) SELECT id,workspace_id,owner_id FROM projects;
WITH roles(role) AS (VALUES ('owner'),('admin'),('member'),('viewer')),
tabs(tab_key) AS (VALUES ('overview'),('rfp'),('wbs'),('architecture'),('requirement'),('screen'),('database'),('program'),('test'),('trace'),('acceptance'),('history'),('export'),('documents')),
defaults AS (SELECT p.project_id,p.workspace_id,r.role,t.tab_key,
 CASE WHEN t.tab_key IN ('overview','trace','acceptance','history','export') OR r.role='viewer' OR (r.role='admin' AND t.tab_key='rfp') OR (r.role='member' AND t.tab_key IN ('rfp','wbs','architecture')) THEN 0 ELSE 1 END AS writable
 FROM project_permission_policies p CROSS JOIN roles r CROSS JOIN tabs t)
INSERT INTO project_role_tab_permissions SELECT project_id,workspace_id,role,tab_key,writable,1,writable,writable FROM defaults;
CREATE TABLE project_rfp_documents (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
 schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1),
 document_json TEXT NOT NULL CHECK(json_valid(document_json) AND json_type(document_json)='object'),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
 UNIQUE(id,project_id,workspace_id), FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);
CREATE UNIQUE INDEX idx_rfp_active ON project_rfp_documents(project_id) WHERE deleted_at IS NULL;
CREATE TABLE project_rfp_revisions (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL, project_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
 document_version INTEGER NOT NULL CHECK(document_version>=1), action TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','DELETE')),
 actor_id TEXT NOT NULL REFERENCES users(id), actor_name TEXT NOT NULL, snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), occurred_at TEXT NOT NULL,
 UNIQUE(document_id,document_version), FOREIGN KEY(document_id,project_id,workspace_id) REFERENCES project_rfp_documents(id,project_id,workspace_id)
);
CREATE TRIGGER rfp_revision_no_update BEFORE UPDATE ON project_rfp_revisions BEGIN SELECT RAISE(ABORT,'RFP revisions are immutable'); END;
CREATE TRIGGER rfp_revision_no_delete BEFORE DELETE ON project_rfp_revisions BEGIN SELECT RAISE(ABORT,'RFP revisions are immutable'); END;
