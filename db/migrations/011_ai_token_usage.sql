-- Usage is an accounting ledger: logical IDs/snapshots survive conversation deletion.
CREATE TABLE ai_token_usage (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT,
  project_name TEXT NOT NULL,
  conv_id TEXT NOT NULL,
  conversation_title TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  chat_saved INTEGER NOT NULL DEFAULT 0 CHECK(chat_saved IN (0,1)),
  request_id TEXT NOT NULL,
  call_index INTEGER NOT NULL CHECK(call_index>=0),
  provider TEXT NOT NULL DEFAULT 'openai',
  response_id TEXT,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  http_status INTEGER,
  usage_known INTEGER NOT NULL DEFAULT 0 CHECK(usage_known IN (0,1)),
  input_tokens INTEGER CHECK(input_tokens>=0),
  output_tokens INTEGER CHECK(output_tokens>=0),
  total_tokens INTEGER CHECK(total_tokens>=0),
  cached_tokens INTEGER CHECK(cached_tokens>=0),
  reasoning_tokens INTEGER CHECK(reasoning_tokens>=0),
  prompt_characters INTEGER NOT NULL CHECK(prompt_characters>=0),
  result_characters INTEGER CHECK(result_characters>=0),
  duration_ms INTEGER CHECK(duration_ms>=0),
  created_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE(request_id,call_index),
  CHECK(usage_known=0 OR (input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND total_tokens=input_tokens+output_tokens)),
  CHECK(usage_known=1 OR (input_tokens IS NULL AND output_tokens IS NULL AND total_tokens IS NULL AND cached_tokens IS NULL AND reasoning_tokens IS NULL))
);
CREATE INDEX idx_ai_usage_scope_time ON ai_token_usage(workspace_id,user_id,created_at);
CREATE INDEX idx_ai_usage_scope_room ON ai_token_usage(workspace_id,user_id,project_id,conv_id,created_at);
CREATE UNIQUE INDEX idx_ai_usage_response ON ai_token_usage(provider,response_id) WHERE response_id IS NOT NULL AND usage_known=1;
