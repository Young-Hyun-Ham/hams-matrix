-- Rebuild both sides of the FK so old pro -> team and old plus -> pro cannot collide.
-- Run in the migration runner's single transaction with foreign_keys enabled.
CREATE TABLE plans_next (
  code TEXT PRIMARY KEY CHECK(code IN ('free','pro','team','business')),
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
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  monthly_discount_price INTEGER CHECK(monthly_discount_price IS NULL OR (monthly_price IS NOT NULL AND monthly_discount_price>=0 AND monthly_discount_price<monthly_price)),
  yearly_discount_price INTEGER CHECK(yearly_discount_price IS NULL OR (yearly_price IS NOT NULL AND yearly_discount_price>=0 AND yearly_discount_price<yearly_price)),
  team_sharing_enabled INTEGER NOT NULL DEFAULT 0 CHECK(team_sharing_enabled IN (0,1))
);
INSERT INTO plans_next(code,name,price_mode,monthly_price,yearly_price,project_limit,token_limit,daily_image_limit,attachment_limit,history_enabled,recommended,version,updated_by,updated_at,monthly_discount_price,yearly_discount_price,team_sharing_enabled)
SELECT CASE code WHEN 'plus' THEN 'pro' WHEN 'pro' THEN 'team' ELSE code END,
       name,price_mode,monthly_price,yearly_price,project_limit,token_limit,daily_image_limit,attachment_limit,history_enabled,recommended,
       version+(SELECT MAX(version) FROM plans)+1,updated_by,strftime('%Y-%m-%dT%H:%M:%fZ','now'),monthly_discount_price,yearly_discount_price,team_sharing_enabled
FROM plans;

CREATE TABLE user_subscriptions_next (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  plan_code TEXT NOT NULL DEFAULT 'free' REFERENCES plans_next(code),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK(billing_cycle IN ('monthly','yearly','contract')),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO user_subscriptions_next(user_id,plan_code,billing_cycle,updated_by,updated_at)
SELECT user_id,CASE plan_code WHEN 'plus' THEN 'pro' WHEN 'pro' THEN 'team' ELSE plan_code END,billing_cycle,updated_by,updated_at
FROM user_subscriptions;

DROP TRIGGER user_default_subscription;
DROP TABLE user_subscriptions;
DROP TABLE plans;
ALTER TABLE plans_next RENAME TO plans;
ALTER TABLE user_subscriptions_next RENAME TO user_subscriptions;
CREATE INDEX idx_subscriptions_plan ON user_subscriptions(plan_code,user_id);
CREATE TRIGGER user_default_subscription AFTER INSERT ON users
BEGIN INSERT INTO user_subscriptions(user_id) VALUES (NEW.id); END;

-- Reject every stale catalog/member form, including old 'pro' requests with changed meaning.
-- New plan versions are strictly higher than ALL pre-migration plan versions.
UPDATE users SET management_version=management_version+1;
-- Leave historical JSON, quota policy versions, sessions and legacy workspace plans untouched.
