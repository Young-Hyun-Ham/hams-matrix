CREATE TABLE IF NOT EXISTS ai_prompt_chats (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT REFERENCES projects(id),
  pathname TEXT NOT NULL,
  tab TEXT,
  screen_title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_chats_scope ON ai_prompt_chats(workspace_id,user_id,project_id,created_at DESC);
