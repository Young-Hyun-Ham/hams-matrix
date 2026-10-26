-- Expand kinds and preserve every existing artifact, link, revision and management number.
-- The migration runner wraps the complete rebuild in one transaction.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE project_artifacts_v2 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('wbs','architecture','requirement','screen','database','program','test')),
  code TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK(status IN ('초안','검토 중','승인','진행 중','완료','보류')),
  fields_json TEXT NOT NULL CHECK(json_valid(fields_json)),
  structure_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(structure_json)),
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
INSERT INTO project_artifacts_v2(id,workspace_id,project_id,kind,code,title,status,fields_json,version,created_by,updated_by,created_at,updated_at,deleted_at)
SELECT id,workspace_id,project_id,kind,code,title,status,fields_json,version,created_by,updated_by,created_at,updated_at,deleted_at FROM project_artifacts;
CREATE TABLE artifact_links_v2 (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'reference' CHECK(relation IN ('reference','wbs_parent','wbs_dependency','foreign_key','table_operation')),
  PRIMARY KEY(source_id,target_id,relation),
  CHECK(source_id <> target_id),
  FOREIGN KEY(source_id,project_id,workspace_id) REFERENCES project_artifacts_v2(id,project_id,workspace_id),
  FOREIGN KEY(target_id,project_id,workspace_id) REFERENCES project_artifacts_v2(id,project_id,workspace_id)
);
INSERT INTO artifact_links_v2(source_id,target_id,project_id,workspace_id)
SELECT source_id,target_id,project_id,workspace_id FROM artifact_links;
CREATE TABLE artifact_revisions_v2 (
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
  FOREIGN KEY(artifact_id,project_id,workspace_id) REFERENCES project_artifacts_v2(id,project_id,workspace_id)
);
INSERT INTO artifact_revisions_v2 SELECT * FROM artifact_revisions;
DROP TABLE artifact_links;
DROP TABLE artifact_revisions;
DROP TABLE project_artifacts;
ALTER TABLE project_artifacts_v2 RENAME TO project_artifacts;
ALTER TABLE artifact_links_v2 RENAME TO artifact_links;
ALTER TABLE artifact_revisions_v2 RENAME TO artifact_revisions;
CREATE INDEX idx_artifacts_project ON project_artifacts(workspace_id,project_id,kind,deleted_at);
CREATE INDEX idx_links_target ON artifact_links(target_id,project_id,workspace_id);
CREATE INDEX idx_revisions_project ON artifact_revisions(workspace_id,project_id,occurred_at);
CREATE TRIGGER artifact_revision_no_update BEFORE UPDATE ON artifact_revisions BEGIN SELECT RAISE(ABORT,'Revisions are immutable'); END;
CREATE TRIGGER artifact_revision_no_delete BEFORE DELETE ON artifact_revisions BEGIN SELECT RAISE(ABORT,'Revisions are immutable'); END;
