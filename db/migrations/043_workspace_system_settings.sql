CREATE TABLE workspace_system_settings (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  stale_time_ms INTEGER NOT NULL DEFAULT 60000 CHECK(typeof(stale_time_ms)='integer' AND stale_time_ms BETWEEN 0 AND 86400000 AND stale_time_ms % 1000=0),
  retry_count INTEGER NOT NULL DEFAULT 3 CHECK(typeof(retry_count)='integer' AND retry_count BETWEEN 0 AND 10),
  error_messages_json TEXT NOT NULL CHECK(json_valid(error_messages_json) AND json_type(error_messages_json)='object'),
  version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version>=1),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
