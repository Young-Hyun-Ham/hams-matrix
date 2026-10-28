-- Keep the old constrained column for compatibility; the new column is authoritative.
ALTER TABLE users RENAME COLUMN account_role TO legacy_account_role;
ALTER TABLE users ADD COLUMN account_role TEXT NOT NULL DEFAULT 'user' CHECK(account_role IN ('master','admin','user','guest'));
UPDATE users SET onboarding_complete=1;
CREATE UNIQUE INDEX idx_single_master ON users(account_role) WHERE account_role='master';
CREATE TRIGGER master_no_delete BEFORE DELETE ON users WHEN OLD.account_role='master'
BEGIN SELECT RAISE(ABORT,'The master account cannot be deleted'); END;
CREATE TRIGGER master_identity_immutable BEFORE UPDATE OF account_role,email,name ON users
WHEN OLD.account_role='master' AND (NEW.account_role!='master' OR NEW.email IS NOT OLD.email OR NEW.name IS NOT OLD.name)
BEGIN SELECT RAISE(ABORT,'The master identity cannot be changed'); END;

CREATE TABLE plans (
  code TEXT PRIMARY KEY CHECK(code IN ('free','plus','pro','business')),
  name TEXT NOT NULL,
  price_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(price_mode IN ('fixed','contact')),
  monthly_price INTEGER CHECK(monthly_price IS NULL OR monthly_price>=0),
  yearly_price INTEGER CHECK(yearly_price IS NULL OR yearly_price>=0),
  project_limit INTEGER CHECK(project_limit IS NULL OR project_limit>=0),
  token_limit INTEGER CHECK(token_limit IS NULL OR token_limit>=0),
  daily_image_limit INTEGER CHECK(daily_image_limit IS NULL OR daily_image_limit>=0),
  attachment_limit INTEGER NOT NULL CHECK(attachment_limit BETWEEN 0 AND 5),
  history_enabled INTEGER NOT NULL CHECK(history_enabled IN (0,1)),
  recommended INTEGER NOT NULL DEFAULT 0 CHECK(recommended IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO plans(code,name,price_mode,monthly_price,yearly_price,project_limit,token_limit,daily_image_limit,attachment_limit,history_enabled,recommended) VALUES
('free','Free','fixed',0,0,1,100000,1,1,0,0),
('plus','Plus','fixed',10000,NULL,3,1000000,3,3,1,1),
('pro','Pro','fixed',100000,NULL,5,10000000,5,5,1,0),
('business','Business','contact',NULL,NULL,NULL,NULL,NULL,5,1,0);
CREATE TABLE user_subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  plan_code TEXT NOT NULL DEFAULT 'free' REFERENCES plans(code),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK(billing_cycle IN ('monthly','yearly','contract')),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Legacy paid memberships require an explicit operator decision; do not grant paid plans automatically.
INSERT INTO user_subscriptions(user_id) SELECT id FROM users;
CREATE TRIGGER user_default_subscription AFTER INSERT ON users
BEGIN INSERT INTO user_subscriptions(user_id) VALUES (NEW.id); END;
CREATE TABLE plan_change_logs (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id),
  resource TEXT NOT NULL, resource_id TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE quota_reservations (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  resource TEXT NOT NULL CHECK(resource IN ('tokens','images')),
  period TEXT NOT NULL, reserved INTEGER NOT NULL CHECK(reserved>=0),
  actual INTEGER CHECK(actual IS NULL OR actual>=0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','settled','released')),
  policy_version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_quota_user_period ON quota_reservations(user_id,resource,period,status);
UPDATE project_members SET role=COALESCE(role,(SELECT CASE WHEN w.role='owner' THEN 'admin' ELSE w.role END FROM workspace_members w WHERE w.workspace_id=project_members.workspace_id AND w.user_id=project_members.user_id),'viewer');
-- Regular members now own their personal workspace regardless of their account role.
UPDATE workspaces SET owner_id=(SELECT m.user_id FROM workspace_members m WHERE m.workspace_id=workspaces.id ORDER BY CASE WHEN m.role='owner' THEN 0 ELSE 1 END,m.joined_at,m.user_id LIMIT 1) WHERE owner_id IS NULL;
UPDATE workspace_members SET role='owner' WHERE EXISTS(SELECT 1 FROM workspaces w WHERE w.id=workspace_members.workspace_id AND w.owner_id=workspace_members.user_id);
