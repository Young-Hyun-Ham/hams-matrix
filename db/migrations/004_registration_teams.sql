ALTER TABLE users ADD COLUMN account_role TEXT NOT NULL DEFAULT 'owner' CHECK(account_role IN ('owner','user'));
ALTER TABLE users ADD COLUMN onboarding_complete INTEGER NOT NULL DEFAULT 1 CHECK(onboarding_complete IN (0,1));
ALTER TABLE users ADD COLUMN active_workspace_id TEXT REFERENCES workspaces(id);
ALTER TABLE workspaces ADD COLUMN subscription_plan TEXT CHECK(subscription_plan IN ('free','team','business'));
ALTER TABLE workspaces ADD COLUMN owner_id TEXT REFERENCES users(id);
UPDATE workspaces SET owner_id=(SELECT user_id FROM workspace_members WHERE workspace_id=workspaces.id AND role='owner' ORDER BY joined_at,user_id LIMIT 1);
UPDATE users SET active_workspace_id=(SELECT workspace_id FROM workspace_members WHERE user_id=users.id ORDER BY joined_at,workspace_id LIMIT 1);
CREATE TABLE team_join_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES users(id),
  UNIQUE(workspace_id,user_id)
);
CREATE INDEX idx_team_requests_status ON team_join_requests(workspace_id,status,requested_at);
CREATE INDEX idx_team_requests_user ON team_join_requests(user_id,requested_at DESC);
