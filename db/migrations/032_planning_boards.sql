CREATE TABLE planning_boards (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, screen_artifact_id TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1), document_json TEXT NOT NULL CHECK(json_valid(document_json)),
 version INTEGER NOT NULL DEFAULT 1, content_version INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','rejected','complete')),
 reviewer_user_id TEXT, review_content_version INTEGER, created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(workspace_id,project_id,screen_artifact_id), UNIQUE(id,workspace_id,project_id,screen_artifact_id),
 FOREIGN KEY(screen_artifact_id,project_id,workspace_id) REFERENCES project_artifacts(id,project_id,workspace_id)
);
CREATE TABLE planning_board_revisions (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, screen_artifact_id TEXT NOT NULL, content_version INTEGER NOT NULL, snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(board_id,workspace_id,project_id,screen_artifact_id) REFERENCES planning_boards(id,workspace_id,project_id,screen_artifact_id));
 CREATE INDEX planning_board_revisions_scope ON planning_board_revisions(workspace_id,project_id,screen_artifact_id,board_id,created_at,id);
CREATE TABLE planning_board_comments (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, screen_artifact_id TEXT NOT NULL, author_id TEXT NOT NULL, author_name TEXT NOT NULL, text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 1000), created_at TEXT NOT NULL,
 FOREIGN KEY(board_id,workspace_id,project_id,screen_artifact_id) REFERENCES planning_boards(id,workspace_id,project_id,screen_artifact_id));
 CREATE INDEX planning_board_comments_scope ON planning_board_comments(workspace_id,project_id,screen_artifact_id,board_id,created_at,id);
CREATE TABLE planning_board_memos (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, screen_artifact_id TEXT NOT NULL, author_id TEXT NOT NULL, updated_by TEXT NOT NULL, data_json TEXT NOT NULL CHECK(json_valid(data_json)), version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(board_id,workspace_id,project_id,screen_artifact_id) REFERENCES planning_boards(id,workspace_id,project_id,screen_artifact_id));
 CREATE INDEX planning_board_memos_scope ON planning_board_memos(workspace_id,project_id,screen_artifact_id,board_id,created_at,id);
CREATE TABLE planning_board_review_history (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, screen_artifact_id TEXT NOT NULL, action TEXT NOT NULL, from_status TEXT NOT NULL, to_status TEXT NOT NULL, actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, reviewer_id TEXT, content_version INTEGER NOT NULL, message TEXT NOT NULL CHECK(length(message)<=2000), created_at TEXT NOT NULL,
 FOREIGN KEY(board_id,workspace_id,project_id,screen_artifact_id) REFERENCES planning_boards(id,workspace_id,project_id,screen_artifact_id));
 CREATE INDEX planning_board_review_history_scope ON planning_board_review_history(workspace_id,project_id,screen_artifact_id,board_id,created_at,id);
CREATE TABLE planning_board_assets (id TEXT PRIMARY KEY, board_id TEXT, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, screen_artifact_id TEXT NOT NULL, draft_id TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 8388608), hash TEXT NOT NULL, created_by TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','attached')), expires_at TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(screen_artifact_id,project_id,workspace_id) REFERENCES project_artifacts(id,project_id,workspace_id),
 FOREIGN KEY(board_id,workspace_id,project_id,screen_artifact_id) REFERENCES planning_boards(id,workspace_id,project_id,screen_artifact_id));
 CREATE INDEX planning_board_assets_scope ON planning_board_assets(workspace_id,project_id,screen_artifact_id,board_id,created_at,id);
 CREATE TABLE planning_board_ai_requests (request_id TEXT PRIMARY KEY, board_id TEXT, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, screen_artifact_id TEXT NOT NULL, user_id TEXT NOT NULL, input_hash TEXT NOT NULL, prompt TEXT NOT NULL, model TEXT NOT NULL, expected_version INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('running','completed','failed')), result_version INTEGER, result_json TEXT, error_code INTEGER, lease_until TEXT NOT NULL, created_at TEXT NOT NULL, finished_at TEXT,
 FOREIGN KEY(screen_artifact_id,project_id,workspace_id) REFERENCES project_artifacts(id,project_id,workspace_id));
 CREATE INDEX planning_board_ai_scope ON planning_board_ai_requests(workspace_id,project_id,screen_artifact_id,user_id,created_at,request_id);
 CREATE TRIGGER planning_board_revision_no_update BEFORE UPDATE ON planning_board_revisions BEGIN SELECT RAISE(ABORT,'Immutable planning board revision'); END;
 CREATE TRIGGER planning_board_revision_no_delete BEFORE DELETE ON planning_board_revisions BEGIN SELECT RAISE(ABORT,'Immutable planning board revision'); END;
 CREATE TRIGGER planning_board_review_no_update BEFORE UPDATE ON planning_board_review_history BEGIN SELECT RAISE(ABORT,'Immutable planning board review'); END;
 CREATE TRIGGER planning_board_review_no_delete BEFORE DELETE ON planning_board_review_history BEGIN SELECT RAISE(ABORT,'Immutable planning board review'); END;
