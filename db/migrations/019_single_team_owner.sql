CREATE UNIQUE INDEX idx_workspace_single_owner ON workspace_members(workspace_id) WHERE role='owner';
