CREATE TABLE IF NOT EXISTS project_sequences (
  project_id TEXT NOT NULL REFERENCES projects(id),
  prefix TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY(project_id,prefix)
);
CREATE TABLE IF NOT EXISTS project_artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('requirement','screen','program')),
  code TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK(status IN ('초안','검토 중','승인','진행 중','완료','보류')),
  fields_json TEXT NOT NULL CHECK(json_valid(fields_json)),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(project_id,code),
  UNIQUE(id,project_id,workspace_id),
  FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);
CREATE TABLE IF NOT EXISTS artifact_links (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  PRIMARY KEY(source_id,target_id),
  CHECK(source_id <> target_id),
  FOREIGN KEY(source_id,project_id,workspace_id) REFERENCES project_artifacts(id,project_id,workspace_id),
  FOREIGN KEY(target_id,project_id,workspace_id) REFERENCES project_artifacts(id,project_id,workspace_id)
);
CREATE TABLE IF NOT EXISTS artifact_revisions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','DELETE')),
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  occurred_at TEXT NOT NULL,
  UNIQUE(artifact_id,version),
  FOREIGN KEY(artifact_id,project_id,workspace_id) REFERENCES project_artifacts(id,project_id,workspace_id)
);
CREATE INDEX IF NOT EXISTS idx_artifacts_project ON project_artifacts(workspace_id,project_id,kind,deleted_at);
CREATE INDEX IF NOT EXISTS idx_links_target ON artifact_links(target_id,project_id,workspace_id);
CREATE INDEX IF NOT EXISTS idx_revisions_project ON artifact_revisions(workspace_id,project_id,occurred_at);
CREATE TRIGGER IF NOT EXISTS artifact_revision_no_update BEFORE UPDATE ON artifact_revisions BEGIN SELECT RAISE(ABORT,'Revisions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS artifact_revision_no_delete BEFORE DELETE ON artifact_revisions BEGIN SELECT RAISE(ABORT,'Revisions are immutable'); END;
