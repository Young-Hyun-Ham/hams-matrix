-- Keep the constrained historical role; do not rebuild the widely referenced users table.
DROP INDEX idx_single_master;
DROP INDEX idx_users_role_joined;
DROP TRIGGER master_no_delete;
DROP TRIGGER master_identity_immutable;
ALTER TABLE users RENAME COLUMN account_role TO previous_account_role;
ALTER TABLE users ADD COLUMN account_role TEXT NOT NULL DEFAULT 'user'
 CHECK(account_role IN ('master','admin','user','guest','biz_admin','team_admin'));
UPDATE users SET account_role=previous_account_role;
CREATE UNIQUE INDEX idx_single_master ON users(account_role) WHERE account_role='master';
CREATE INDEX idx_users_role_joined ON users(account_role,created_at DESC,id DESC);
CREATE TRIGGER master_no_delete BEFORE DELETE ON users WHEN OLD.account_role='master'
BEGIN SELECT RAISE(ABORT,'The master account cannot be deleted'); END;
CREATE TRIGGER master_identity_immutable BEFORE UPDATE OF account_role,email,name ON users
WHEN OLD.account_role='master' AND (NEW.account_role!='master' OR NEW.email IS NOT OLD.email OR NEW.name IS NOT OLD.name)
BEGIN SELECT RAISE(ABORT,'The master identity cannot be changed'); END;

CREATE TABLE plan_products (
 id TEXT PRIMARY KEY, product_code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 plan_code TEXT NOT NULL REFERENCES plans(code) CHECK(plan_code IN ('team','business')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','expired')),
 created_by TEXT NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE contracts (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES plan_products(id),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','expired')),
 member_limit INTEGER CHECK(member_limit IS NULL OR member_limit>0),
 admin_limit INTEGER CHECK(admin_limit IS NULL OR admin_limit>0),
 starts_at TEXT NOT NULL, ends_at TEXT, version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE UNIQUE INDEX idx_product_active_contract ON contracts(product_id) WHERE status='active';
CREATE TABLE product_members (
 product_id TEXT NOT NULL REFERENCES plan_products(id), user_id TEXT NOT NULL REFERENCES users(id),
 role TEXT NOT NULL CHECK(role IN ('admin','member')), status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
 previous_plan TEXT NOT NULL DEFAULT 'free' REFERENCES plans(code),
 granted_by TEXT NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1,
 granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), revoked_at TEXT,
 PRIMARY KEY(product_id,user_id)
);
CREATE UNIQUE INDEX idx_user_active_product ON product_members(user_id) WHERE status='active';
CREATE INDEX idx_product_members_scope ON product_members(product_id,status,user_id);
ALTER TABLE user_subscriptions ADD COLUMN product_id TEXT REFERENCES plan_products(id);
ALTER TABLE workspaces ADD COLUMN product_id TEXT REFERENCES plan_products(id);
CREATE INDEX idx_workspaces_product ON workspaces(product_id,id);

CREATE TABLE business_requests (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), company_name TEXT NOT NULL,
 contact TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','reviewing','contracting','approved','rejected','withdrawn')),
 product_id TEXT REFERENCES plan_products(id), contract_id TEXT REFERENCES contracts(id),
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_user_open_business_request ON business_requests(user_id) WHERE status IN ('submitted','reviewing','contracting');
CREATE TABLE notifications (
 id TEXT PRIMARY KEY, recipient_user_id TEXT NOT NULL REFERENCES users(id),
 type TEXT NOT NULL CHECK(type='business_request'), business_request_id TEXT NOT NULL REFERENCES business_requests(id),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), read_at TEXT,
 UNIQUE(recipient_user_id,business_request_id)
);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_user_id,read_at,created_at);
CREATE TABLE payment_orders (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), product_id TEXT REFERENCES plan_products(id),
 amount INTEGER NOT NULL CHECK(amount>0), currency TEXT NOT NULL DEFAULT 'KRW' CHECK(currency='KRW'),
 plan_version INTEGER NOT NULL, billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly','yearly')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled','refunded')),
 provider TEXT NOT NULL, provider_payment_id TEXT UNIQUE, fulfilled_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE payment_events (
 provider TEXT NOT NULL, event_id TEXT NOT NULL, order_id TEXT NOT NULL REFERENCES payment_orders(id),
 status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(provider,event_id)
);
CREATE TABLE product_events (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES plan_products(id), actor_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, target_id TEXT, before_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(before_json)),
 after_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(after_json)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_product_events_scope ON product_events(product_id,created_at DESC,id);
CREATE TRIGGER product_events_no_update BEFORE UPDATE ON product_events BEGIN SELECT RAISE(ABORT,'Append-only'); END;
CREATE TRIGGER product_events_no_delete BEFORE DELETE ON product_events BEGIN SELECT RAISE(ABORT,'Append-only'); END;

DROP TRIGGER workspace_initial_plan;
CREATE TRIGGER workspace_initial_plan AFTER INSERT ON workspaces
BEGIN
 UPDATE workspaces SET
  plan=COALESCE((SELECT plan_code FROM user_subscriptions WHERE user_id=NEW.owner_id),'free'),
  subscription_plan=COALESCE((SELECT plan_code FROM user_subscriptions WHERE user_id=NEW.owner_id),'free'),
  product_id=(SELECT product_id FROM user_subscriptions WHERE user_id=NEW.owner_id)
 WHERE id=NEW.id;
END;
CREATE TRIGGER workspace_product_immutable BEFORE UPDATE OF product_id ON workspaces
WHEN OLD.product_id IS NOT NULL AND NEW.product_id IS NOT OLD.product_id
BEGIN SELECT RAISE(ABORT,'The workspace product cannot be changed'); END;
CREATE TRIGGER workspace_product_consistent BEFORE UPDATE OF plan,product_id ON workspaces
WHEN NEW.product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM plan_products p WHERE p.id=NEW.product_id AND p.plan_code=NEW.plan)
BEGIN SELECT RAISE(ABORT,'Workspace product type mismatch'); END;
CREATE TRIGGER project_owner_immutable BEFORE UPDATE OF owner_id ON projects
WHEN NEW.owner_id IS NOT OLD.owner_id
BEGIN SELECT RAISE(ABORT,'Project ownership transfer is not allowed'); END;
