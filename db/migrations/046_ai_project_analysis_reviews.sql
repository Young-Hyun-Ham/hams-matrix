PRAGMA defer_foreign_keys=ON;
CREATE TABLE ai_conversations_next (
 conv_id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),user_id TEXT NOT NULL REFERENCES users(id),project_id TEXT REFERENCES projects(id),title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 100),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,request_id TEXT,busy_until TEXT,is_pinned INTEGER NOT NULL DEFAULT 0 CHECK(is_pinned IN (0,1)),target_page TEXT CHECK(target_page IS NULL OR target_page IN ('overview','rfp','wbs','architecture','requirement','screen','database','function','program','test','trace','acceptance','history','export','documents','dashboard','team','project-analysis')),target_version INTEGER NOT NULL DEFAULT 0 CHECK(typeof(target_version)='integer' AND target_version>=0));
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

ALTER TABLE ai_conversations ADD COLUMN title_source TEXT NOT NULL DEFAULT 'legacy' CHECK(title_source IN ('legacy','auto_pending','auto','manual'));
ALTER TABLE ai_conversations ADD COLUMN title_version INTEGER NOT NULL DEFAULT 0 CHECK(title_version>=0);
CREATE TABLE user_ai_settings (
 user_id TEXT NOT NULL REFERENCES users(id), workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 hitl_enabled INTEGER NOT NULL DEFAULT 1 CHECK(hitl_enabled IN (0,1)),
 token_limit INTEGER NOT NULL DEFAULT 1000000 CHECK(typeof(token_limit)='integer' AND token_limit BETWEEN 1 AND 9007199254740991),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,workspace_id)
);
CREATE TABLE ai_change_reviews (
 review_id TEXT PRIMARY KEY, request_id TEXT NOT NULL, chat_id TEXT NOT NULL REFERENCES ai_prompt_chats(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), workspace_id TEXT NOT NULL REFERENCES workspaces(id), project_id TEXT NOT NULL REFERENCES projects(id),
 conv_id TEXT NOT NULL REFERENCES ai_conversations(conv_id) ON DELETE CASCADE,
 target_page TEXT NOT NULL, target_version INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','rejected','expired','invalidated')),
 version INTEGER NOT NULL DEFAULT 1, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), payload_hash TEXT NOT NULL,
 source_versions_json TEXT NOT NULL CHECK(json_valid(source_versions_json)), guardrail_version INTEGER NOT NULL, settings_version INTEGER NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT,
 applied_actions_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(applied_actions_json))
);
CREATE UNIQUE INDEX idx_ai_review_pending ON ai_change_reviews(workspace_id,user_id,conv_id) WHERE status='pending';
CREATE INDEX idx_ai_review_chat ON ai_change_reviews(workspace_id,user_id,chat_id);

-- Verify the rebuilt graph before clearing SQLite's deferred DROP bookkeeping.
CREATE TABLE ai_project_fk_guard(n INTEGER CHECK(n=0));
INSERT INTO ai_project_fk_guard SELECT COUNT(*) FROM pragma_foreign_key_check;
DROP TABLE ai_project_fk_guard;
PRAGMA defer_foreign_keys=OFF;
