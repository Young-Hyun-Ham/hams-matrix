ALTER TABLE plans ADD COLUMN project_invite_limit INTEGER
 CHECK(project_invite_limit IS NULL OR (typeof(project_invite_limit)='integer' AND project_invite_limit>=0));
UPDATE plans SET project_invite_limit=CASE code WHEN 'free' THEN 1 WHEN 'pro' THEN 1 WHEN 'team' THEN 20 ELSE NULL END,
 version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
