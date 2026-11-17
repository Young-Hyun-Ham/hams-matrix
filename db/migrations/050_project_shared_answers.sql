-- Shared knowledge never grants access to another user's private conversation.
ALTER TABLE ai_prompt_chats ADD COLUMN provenance_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(provenance_json));
ALTER TABLE ai_prompt_chats ADD COLUMN shared_answer_id TEXT;
ALTER TABLE ai_prompt_chats ADD COLUMN shared_answer_version INTEGER;
CREATE TABLE project_shared_answers (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
 created_by TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending_review','active','needs_review','rejected','revoked')),
 version INTEGER NOT NULL DEFAULT 1, active_version INTEGER NOT NULL DEFAULT 1,
 idempotency_key TEXT NOT NULL, input_hash TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(id,project_id,workspace_id), UNIQUE(workspace_id,project_id,created_by,idempotency_key),
 FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);
CREATE TABLE project_shared_answer_versions (
 answer_id TEXT NOT NULL, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, version INTEGER NOT NULL,
 question TEXT NOT NULL, aliases_json TEXT NOT NULL CHECK(json_valid(aliases_json)),
 contract_json TEXT NOT NULL CHECK(json_valid(contract_json)),
 answer_text TEXT NOT NULL, answer_hash TEXT NOT NULL, model TEXT NOT NULL,
 evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)), source_chat_id TEXT,
 originally_answered_at TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(answer_id,version),
 FOREIGN KEY(answer_id,project_id,workspace_id) REFERENCES project_shared_answers(id,project_id,workspace_id)
);
CREATE TRIGGER shared_answer_version_immutable BEFORE UPDATE ON project_shared_answer_versions
 BEGIN SELECT RAISE(ABORT,'Shared answer versions are immutable'); END;
CREATE TABLE project_shared_answer_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, answer_id TEXT NOT NULL,
 answer_version INTEGER NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL,
 request_id TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(answer_id,project_id,workspace_id) REFERENCES project_shared_answers(id,project_id,workspace_id)
);
CREATE INDEX idx_shared_answers_scope ON project_shared_answers(workspace_id,project_id,status,id);
CREATE INDEX idx_shared_answer_events_scope ON project_shared_answer_events(workspace_id,project_id,created_at);
CREATE TABLE project_shared_answer_selections (
 token_hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, user_id TEXT NOT NULL,
 conv_id TEXT NOT NULL, target_version INTEGER NOT NULL, question_hash TEXT NOT NULL,
 candidates_json TEXT NOT NULL CHECK(json_valid(candidates_json)), expires_at TEXT NOT NULL
);
CREATE TABLE project_shared_answer_registrations (
 workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, user_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL, input_hash TEXT NOT NULL, answer_id TEXT NOT NULL,
 PRIMARY KEY(workspace_id,project_id,user_id,idempotency_key),
 FOREIGN KEY(answer_id,project_id,workspace_id) REFERENCES project_shared_answers(id,project_id,workspace_id)
);
