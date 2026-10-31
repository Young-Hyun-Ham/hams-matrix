CREATE TABLE wbs_schedule_publications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  source_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  created_by TEXT NOT NULL REFERENCES users(id),
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, sequence),
  UNIQUE(project_id, source_hash),
  FOREIGN KEY(project_id, workspace_id) REFERENCES projects(id, workspace_id)
);
CREATE INDEX idx_wbs_publications_project ON wbs_schedule_publications(workspace_id, project_id, sequence DESC);
CREATE TRIGGER wbs_publication_no_update BEFORE UPDATE ON wbs_schedule_publications BEGIN SELECT RAISE(ABORT,'Published schedules are immutable'); END;
CREATE TRIGGER wbs_publication_no_delete BEFORE DELETE ON wbs_schedule_publications BEGIN SELECT RAISE(ABORT,'Published schedules are immutable'); END;
