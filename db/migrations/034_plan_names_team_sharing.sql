-- Product labels change; subscription codes and all existing commercial settings stay intact.
ALTER TABLE plans ADD COLUMN team_sharing_enabled INTEGER NOT NULL DEFAULT 0 CHECK(team_sharing_enabled IN (0,1));
UPDATE plans
SET name=CASE code WHEN 'plus' THEN 'Pro' WHEN 'pro' THEN 'Team' ELSE name END,
    team_sharing_enabled=CASE WHEN code IN ('pro','business') THEN 1 ELSE 0 END,
    version=version+1,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
-- schema_migrations identifies this deployment change; preserve updated_by and historical logs.
