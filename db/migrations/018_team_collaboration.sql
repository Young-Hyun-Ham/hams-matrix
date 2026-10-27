ALTER TABLE users ADD COLUMN job_title TEXT NOT NULL DEFAULT '' CHECK(length(job_title)<=80);
ALTER TABLE workspace_members ADD COLUMN join_source TEXT NOT NULL DEFAULT 'existing' CHECK(join_source IN ('existing','application','direct','project'));
UPDATE workspace_members SET join_source='application',role=CASE WHEN role='viewer' THEN 'member' ELSE role END
WHERE EXISTS (SELECT 1 FROM team_join_requests r WHERE r.workspace_id=workspace_members.workspace_id AND r.user_id=workspace_members.user_id AND r.status='approved');

ALTER TABLE projects ADD COLUMN owner_id TEXT REFERENCES users(id);
UPDATE projects SET owner_id=created_by;
INSERT OR IGNORE INTO project_members(project_id,workspace_id,user_id) SELECT id,workspace_id,owner_id FROM projects;
ALTER TABLE project_members ADD COLUMN role TEXT CHECK(role IN ('admin','member','viewer'));
CREATE TRIGGER project_owner_required_insert BEFORE INSERT ON projects WHEN NEW.owner_id IS NULL
BEGIN SELECT RAISE(ABORT,'Project owner is required'); END;
CREATE TRIGGER project_owner_valid_update BEFORE UPDATE OF owner_id ON projects
WHEN NEW.owner_id IS NULL OR NOT EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=NEW.id AND m.workspace_id=NEW.workspace_id AND m.user_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'Project owner must be a project member'); END;
CREATE TRIGGER project_owner_membership_delete BEFORE DELETE ON project_members
WHEN EXISTS(SELECT 1 FROM projects p WHERE p.id=OLD.project_id AND p.owner_id=OLD.user_id)
BEGIN SELECT RAISE(ABORT,'Transfer ownership before removing the owner'); END;

CREATE TABLE team_posts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT,
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 10000),
  category TEXT NOT NULL DEFAULT '공유' CHECK(category IN ('공유','공지','질문','진행 상황')),
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);
CREATE INDEX idx_team_posts_scope ON team_posts(workspace_id,created_at DESC);
CREATE TABLE team_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES team_posts(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_team_comments_post ON team_comments(workspace_id,post_id,created_at);
