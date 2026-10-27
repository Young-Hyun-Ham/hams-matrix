CREATE TABLE ai_guardrail_configs (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
  active_version INTEGER,
  draft_json TEXT NOT NULL CHECK(json_valid(draft_json)),
  draft_revision INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL
);
CREATE TABLE ai_guardrail_policies (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  version INTEGER NOT NULL,
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  published_by TEXT NOT NULL REFERENCES users(id),
  published_at TEXT NOT NULL,
  restored_from INTEGER,
  PRIMARY KEY(workspace_id,version)
);
CREATE TABLE ai_guardrail_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  stage TEXT NOT NULL,
  decision TEXT NOT NULL,
  rules_json TEXT NOT NULL CHECK(json_valid(rules_json)),
  duration_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_guardrail_events_scope ON ai_guardrail_events(workspace_id,created_at DESC);
ALTER TABLE ai_token_usage ADD COLUMN purpose TEXT NOT NULL DEFAULT 'generation';
ALTER TABLE ai_generation_requests ADD COLUMN guardrail_version INTEGER;
CREATE TRIGGER guardrail_policy_immutable_update BEFORE UPDATE ON ai_guardrail_policies
BEGIN SELECT RAISE(ABORT,'Published policies are immutable'); END;
CREATE TRIGGER guardrail_policy_immutable_delete BEFORE DELETE ON ai_guardrail_policies
BEGIN SELECT RAISE(ABORT,'Published policies are immutable'); END;
