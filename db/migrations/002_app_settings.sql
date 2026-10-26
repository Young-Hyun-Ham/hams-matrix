-- Global application settings. No public/client API; admin authorization will be added later.
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY CHECK(length(setting_key) BETWEEN 1 AND 100),
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  value_type TEXT NOT NULL CHECK(value_type IN ('boolean','number','string','json')),
  category TEXT NOT NULL DEFAULT 'general',
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (
    (value_type = 'boolean' AND json_type(value_json) IN ('true','false')) OR
    (value_type = 'number' AND json_type(value_json) IN ('integer','real')) OR
    (value_type = 'string' AND json_type(value_json) = 'text') OR
    value_type = 'json'
  )
);
CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings(category,setting_key);
INSERT INTO app_settings(setting_key,value_json,value_type,category,label,description)
VALUES ('DB_LOGGING_ENABLED','false','boolean','logging','DB 감사 이력 저장','true일 때 조회·인증·데이터 변경 이력을 저장합니다.')
ON CONFLICT(setting_key) DO NOTHING;
