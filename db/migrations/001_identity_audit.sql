PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80), password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free','pro','business')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id), user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider TEXT NOT NULL CHECK(provider IN ('google','naver','kakao')),
  provider_account_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(provider,provider_account_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id), workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id,expires_at);
CREATE TABLE IF NOT EXISTS auth_rate_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, resets_at INTEGER NOT NULL);
-- Snapshots intentionally have no FK: evidence survives later account/resource deletion.
-- Never store passwords, raw tokens, email addresses or complete request bodies here.
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, request_id TEXT NOT NULL,
  workspace_id TEXT, actor_id TEXT, actor_name TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('user','anonymous','system')),
  action TEXT NOT NULL CHECK(action IN ('CREATE','READ','UPDATE','DELETE','LOGIN','LOGOUT','LOGIN_FAILED','OAUTH_START','OAUTH_FAILED')),
  resource_type TEXT NOT NULL, resource_id TEXT,
  outcome TEXT NOT NULL CHECK(outcome IN ('success','failure')),
  source TEXT NOT NULL CHECK(source IN ('web','oauth','system')),
  http_method TEXT NOT NULL, route TEXT NOT NULL,
  changed_fields_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(changed_fields_json)),
  before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json)),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)), error_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_workspace_time ON audit_logs(workspace_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time ON audit_logs(actor_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(workspace_id,resource_type,resource_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_logs(request_id);
CREATE TRIGGER IF NOT EXISTS audit_logs_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT,'Audit logs are append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT,'Audit logs are append-only'); END;
