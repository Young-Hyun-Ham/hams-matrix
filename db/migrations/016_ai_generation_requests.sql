CREATE TABLE ai_generation_requests (
  request_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  conv_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','stop_requested','finalizing','completed','cancelled','failed')),
  actions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE INDEX idx_ai_generation_owner ON ai_generation_requests(workspace_id,user_id,conv_id);

ALTER TABLE ai_token_usage ADD COLUMN usage_final INTEGER NOT NULL DEFAULT 0 CHECK(usage_final IN (0,1));
UPDATE ai_token_usage SET usage_final=usage_known WHERE status NOT IN ('started','queued','in_progress');
