CREATE TABLE user_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 toast_position TEXT NOT NULL DEFAULT 'bottom' CHECK(toast_position IN ('top','bottom')),
 default_theme TEXT NOT NULL DEFAULT 'light' CHECK(default_theme IN ('light','dark')),
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
ALTER TABLE users ADD COLUMN management_version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE admin_setting_changes (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL,
 setting_key TEXT NOT NULL CHECK(setting_key='DB_LOGGING_ENABLED'),
 before_value INTEGER NOT NULL CHECK(before_value IN (0,1)),
 after_value INTEGER NOT NULL CHECK(after_value IN (0,1)),
 request_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER admin_setting_changes_no_update BEFORE UPDATE ON admin_setting_changes BEGIN SELECT RAISE(ABORT,'Append-only'); END;
CREATE TRIGGER admin_setting_changes_no_delete BEFORE DELETE ON admin_setting_changes BEGIN SELECT RAISE(ABORT,'Append-only'); END;
CREATE INDEX idx_audit_global_time ON audit_logs(occurred_at DESC,id DESC);
CREATE INDEX idx_plan_changes_time ON plan_change_logs(created_at DESC,id DESC);
CREATE INDEX idx_setting_changes_time ON admin_setting_changes(created_at DESC,id DESC);
CREATE INDEX idx_users_joined ON users(created_at DESC,id DESC);
CREATE INDEX idx_users_role_joined ON users(account_role,created_at DESC,id DESC);
CREATE INDEX idx_subscriptions_plan ON user_subscriptions(plan_code,user_id);

ALTER TABLE plan_change_logs ADD COLUMN actor_name TEXT;
