-- Preserve the old constrained values while introducing all current plan codes.
-- Backfill once from the workspace owner's current subscription; later subscription
-- changes deliberately do not update a workspace's plan.
ALTER TABLE workspaces RENAME COLUMN plan TO legacy_workspace_plan;
ALTER TABLE workspaces RENAME COLUMN subscription_plan TO legacy_subscription_plan;
ALTER TABLE workspaces ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'
  CHECK(plan IN ('free','pro','team','business'));
ALTER TABLE workspaces ADD COLUMN subscription_plan TEXT NOT NULL DEFAULT 'free'
  CHECK(subscription_plan IN ('free','pro','team','business'))
  CHECK(subscription_plan=plan);

UPDATE workspaces
SET plan=COALESCE((SELECT s.plan_code FROM user_subscriptions s WHERE s.user_id=workspaces.owner_id),'free'),
    subscription_plan=COALESCE((SELECT s.plan_code FROM user_subscriptions s WHERE s.user_id=workspaces.owner_id),'free');

-- Capture the creation-time subscription even for callers using column defaults.
CREATE TRIGGER workspace_initial_plan AFTER INSERT ON workspaces
BEGIN
  UPDATE workspaces
  SET plan=COALESCE((SELECT plan_code FROM user_subscriptions WHERE user_id=NEW.owner_id),'free'),
      subscription_plan=COALESCE((SELECT plan_code FROM user_subscriptions WHERE user_id=NEW.owner_id),'free')
  WHERE id=NEW.id;
END;

-- SQLite cannot add a non-null REFERENCES column to populated tables. Keep the
-- catalog reference protected without rebuilding a heavily referenced table.
CREATE TRIGGER workspace_plan_exists BEFORE INSERT ON workspaces
WHEN NOT EXISTS(SELECT 1 FROM plans WHERE code=NEW.plan)
BEGIN SELECT RAISE(ABORT,'Unknown workspace plan'); END;
CREATE TRIGGER workspace_plan_update_exists BEFORE UPDATE OF plan ON workspaces
WHEN NOT EXISTS(SELECT 1 FROM plans WHERE code=NEW.plan)
BEGIN SELECT RAISE(ABORT,'Unknown workspace plan'); END;
CREATE TRIGGER workspace_plan_no_catalog_delete BEFORE DELETE ON plans
WHEN EXISTS(SELECT 1 FROM workspaces WHERE plan=OLD.code)
BEGIN SELECT RAISE(ABORT,'Plan is referenced by a workspace'); END;
CREATE TRIGGER workspace_plan_no_catalog_rename BEFORE UPDATE OF code ON plans
WHEN NEW.code!=OLD.code AND EXISTS(SELECT 1 FROM workspaces WHERE plan=OLD.code)
BEGIN SELECT RAISE(ABORT,'Plan is referenced by a workspace'); END;
