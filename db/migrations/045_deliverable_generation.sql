-- Preserve identifiers and all dependent tables. Run as one transaction.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE project_artifacts_next (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('wbs','architecture','requirement','screen','database','function','program','test')),
  code TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK(status IN ('초안','검토 중','승인','진행 중','완료','보류')),
  fields_json TEXT NOT NULL CHECK(json_valid(fields_json)),
  structure_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(structure_json)),
  detail_level TEXT NOT NULL DEFAULT 'detail' CHECK(detail_level IN ('skeleton','detail')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(project_id,code),
  UNIQUE(id,project_id,workspace_id),
  FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);

INSERT INTO project_artifacts_next(id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at,deleted_at) SELECT id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at,deleted_at FROM project_artifacts;
DROP TABLE project_artifacts;
ALTER TABLE project_artifacts_next RENAME TO project_artifacts;
CREATE INDEX idx_artifacts_project ON project_artifacts(workspace_id,project_id,kind,deleted_at);
CREATE TABLE project_role_tab_permissions_next (
 project_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
 tab_key TEXT NOT NULL CHECK(tab_key IN ('overview','rfp','wbs','architecture','requirement','screen','database','function','program','test','trace','acceptance','history','export','documents')),
 can_create INTEGER NOT NULL CHECK(can_create IN (0,1)), can_read INTEGER NOT NULL DEFAULT 1 CHECK(can_read=1),
 can_update INTEGER NOT NULL CHECK(can_update IN (0,1)), can_delete INTEGER NOT NULL CHECK(can_delete IN (0,1)),
 PRIMARY KEY(project_id,role,tab_key),
 FOREIGN KEY(project_id,workspace_id) REFERENCES project_permission_policies(project_id,workspace_id),
 CHECK(role!='viewer' OR (can_create=0 AND can_update=0 AND can_delete=0)),
 CHECK(role!='admin' OR tab_key!='rfp' OR (can_create=0 AND can_update=0 AND can_delete=0)),
 CHECK(role!='member' OR tab_key NOT IN ('rfp','wbs','architecture') OR (can_create=0 AND can_update=0 AND can_delete=0))
);

INSERT INTO project_role_tab_permissions_next SELECT * FROM project_role_tab_permissions;
DROP TABLE project_role_tab_permissions;
ALTER TABLE project_role_tab_permissions_next RENAME TO project_role_tab_permissions;
INSERT INTO project_role_tab_permissions SELECT project_id,workspace_id,role,'function',can_create,can_read,can_update,can_delete FROM project_role_tab_permissions WHERE tab_key='program';
CREATE TABLE ai_conversations_next (
 conv_id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),user_id TEXT NOT NULL REFERENCES users(id),project_id TEXT REFERENCES projects(id),title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 100),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,request_id TEXT,busy_until TEXT,is_pinned INTEGER NOT NULL DEFAULT 0 CHECK(is_pinned IN (0,1)),target_page TEXT CHECK(target_page IS NULL OR target_page IN ('overview','rfp','wbs','architecture','requirement','screen','database','function','program','test','trace','acceptance','history','export','documents','dashboard','team')),target_version INTEGER NOT NULL DEFAULT 0 CHECK(typeof(target_version)='integer' AND target_version>=0));
INSERT INTO ai_conversations_next SELECT * FROM ai_conversations;
DROP TRIGGER ai_chat_conversation_insert;
DROP TRIGGER ai_chat_conversation_update;
DROP TABLE ai_conversations;
ALTER TABLE ai_conversations_next RENAME TO ai_conversations;
CREATE TRIGGER ai_chat_conversation_insert BEFORE INSERT ON ai_prompt_chats
WHEN NOT EXISTS (
  SELECT 1 FROM ai_conversations c WHERE c.conv_id=NEW.conv_id
    AND c.workspace_id=NEW.workspace_id AND c.user_id=NEW.user_id AND c.project_id IS NEW.project_id
)
BEGIN SELECT RAISE(ABORT,'Invalid conversation scope'); END;
CREATE TRIGGER ai_chat_conversation_update BEFORE UPDATE OF conv_id,workspace_id,user_id,project_id ON ai_prompt_chats
WHEN NOT EXISTS (
  SELECT 1 FROM ai_conversations c WHERE c.conv_id=NEW.conv_id
    AND c.workspace_id=NEW.workspace_id AND c.user_id=NEW.user_id AND c.project_id IS NEW.project_id
)
BEGIN SELECT RAISE(ABORT,'Invalid conversation scope'); END;

CREATE INDEX idx_ai_conversations_scope ON ai_conversations(workspace_id,user_id,project_id,updated_at DESC,conv_id);
CREATE INDEX idx_ai_conversations_pinned ON ai_conversations(workspace_id,user_id,project_id,is_pinned DESC,updated_at DESC,conv_id DESC);
CREATE TRIGGER ai_conversation_target_scope_insert BEFORE INSERT ON ai_conversations
WHEN NEW.target_page IS NOT NULL AND ((NEW.project_id IS NULL AND NEW.target_page NOT IN ('dashboard','team')) OR (NEW.project_id IS NOT NULL AND NEW.target_page IN ('dashboard','team')))
BEGIN SELECT RAISE(ABORT,'Invalid AI target scope'); END;
CREATE TRIGGER ai_conversation_target_scope_update BEFORE UPDATE OF target_page,project_id ON ai_conversations
WHEN NEW.target_page IS NOT NULL AND ((NEW.project_id IS NULL AND NEW.target_page NOT IN ('dashboard','team')) OR (NEW.project_id IS NOT NULL AND NEW.target_page IN ('dashboard','team')))
BEGIN SELECT RAISE(ABORT,'Invalid AI target scope'); END;

CREATE TABLE project_source_snapshots (
 id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,source_type TEXT NOT NULL CHECK(source_type IN ('rfp','file')),source_id TEXT NOT NULL,source_version INTEGER,name TEXT NOT NULL,content_hash TEXT NOT NULL,content TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(id,project_id,workspace_id),FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id));
CREATE TRIGGER source_snapshot_no_update BEFORE UPDATE ON project_source_snapshots BEGIN SELECT RAISE(ABORT,'Source snapshots are immutable'); END;
CREATE TRIGGER source_snapshot_no_delete BEFORE DELETE ON project_source_snapshots BEGIN SELECT RAISE(ABORT,'Source snapshots are immutable'); END;
CREATE TABLE artifact_source_references (
 artifact_id TEXT NOT NULL,snapshot_id TEXT NOT NULL,project_id TEXT NOT NULL,workspace_id TEXT NOT NULL,locator TEXT NOT NULL,excerpt TEXT NOT NULL,rationale TEXT NOT NULL,origin TEXT NOT NULL CHECK(origin IN ('원문 명시','설계 도출','사용자 지정')),PRIMARY KEY(artifact_id,snapshot_id,locator),FOREIGN KEY(artifact_id,project_id,workspace_id) REFERENCES project_artifacts(id,project_id,workspace_id),FOREIGN KEY(snapshot_id,project_id,workspace_id) REFERENCES project_source_snapshots(id,project_id,workspace_id));
CREATE TABLE project_deliverable_generation_requests (
 request_id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,user_id TEXT NOT NULL,input_json TEXT NOT NULL CHECK(json_valid(input_json)),status TEXT NOT NULL CHECK(status IN ('running','validating','finalizing','completed','review_required','stop_requested','cancelled','failed')),stage INTEGER NOT NULL DEFAULT 0,payload_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(payload_json)),result_json TEXT,error TEXT,lease_token TEXT,lease_until TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id));
CREATE UNIQUE INDEX idx_deliverable_active ON project_deliverable_generation_requests(workspace_id,project_id) WHERE status IN ('running','validating','finalizing','stop_requested');
-- Rebuilding a referenced parent can leave SQLite deferred-drop counters even
-- when all restored parent keys exist. Validate every FK before clearing them.
CREATE TEMP TABLE deliverable_fk_guard (violations INTEGER NOT NULL CHECK(violations=0));
INSERT INTO deliverable_fk_guard SELECT COUNT(*) FROM pragma_foreign_key_check;
DROP TABLE deliverable_fk_guard;
PRAGMA defer_foreign_keys=OFF;
