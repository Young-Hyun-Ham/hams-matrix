CREATE TABLE notification_acknowledgements (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 notification_key TEXT NOT NULL,
 read_at TEXT NOT NULL,
 PRIMARY KEY(user_id,workspace_id,notification_key)
);
