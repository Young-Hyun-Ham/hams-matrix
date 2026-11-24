CREATE TABLE builder_scenarios (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 description TEXT NOT NULL DEFAULT '', job TEXT NOT NULL DEFAULT 'Process',
 scenario_type TEXT NOT NULL DEFAULT 'sub' CHECK(scenario_type IN ('agent','multi','sub')),
 definition_json TEXT NOT NULL CHECK(json_valid(definition_json)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 latest_version INTEGER NOT NULL DEFAULT 0 CHECK(latest_version>=0),
 deployed_version INTEGER CHECK(deployed_version IS NULL OR deployed_version>0),
 created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_used_at TEXT, deleted_at TEXT,
 UNIQUE(workspace_id,id)
);
CREATE INDEX idx_builder_scenarios_list ON builder_scenarios(workspace_id,deleted_at,updated_at DESC,id DESC);
CREATE INDEX idx_builder_scenarios_used ON builder_scenarios(workspace_id,deleted_at,last_used_at DESC,id DESC);
CREATE TABLE builder_scenario_versions (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, scenario_id TEXT NOT NULL,
 version_number INTEGER NOT NULL CHECK(version_number>0),
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 UNIQUE(workspace_id,scenario_id,version_number), UNIQUE(workspace_id,scenario_id,request_id),
 FOREIGN KEY(workspace_id,scenario_id) REFERENCES builder_scenarios(workspace_id,id)
);
CREATE INDEX idx_builder_versions ON builder_scenario_versions(workspace_id,scenario_id,version_number DESC);
CREATE TABLE builder_scenario_deployments (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, scenario_id TEXT NOT NULL,
 version_number INTEGER NOT NULL, memo TEXT NOT NULL DEFAULT '',
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 UNIQUE(workspace_id,scenario_id,request_id),
 FOREIGN KEY(workspace_id,scenario_id,version_number) REFERENCES builder_scenario_versions(workspace_id,scenario_id,version_number)
);
CREATE INDEX idx_builder_deployments ON builder_scenario_deployments(workspace_id,scenario_id,created_at DESC,id DESC);
CREATE TABLE builder_forms (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 elements_json TEXT NOT NULL CHECK(json_valid(elements_json)),
 definition_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(definition_json)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
 UNIQUE(workspace_id,id)
);
CREATE INDEX idx_builder_forms ON builder_forms(workspace_id,deleted_at,updated_at DESC,id DESC);
CREATE TABLE builder_templates (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 kind TEXT NOT NULL CHECK(kind IN ('api','form')),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 content_json TEXT NOT NULL CHECK(json_valid(content_json)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
 UNIQUE(workspace_id,id)
);
CREATE INDEX idx_builder_templates ON builder_templates(workspace_id,kind,deleted_at,updated_at DESC,id DESC);
CREATE TABLE builder_user_settings (
 workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
 settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),
 revision INTEGER NOT NULL CHECK(revision>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,user_id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES workspace_members(workspace_id,user_id)
);
CREATE TRIGGER builder_version_no_update BEFORE UPDATE ON builder_scenario_versions BEGIN SELECT RAISE(ABORT,'Builder versions are immutable'); END;
CREATE TRIGGER builder_version_no_delete BEFORE DELETE ON builder_scenario_versions BEGIN SELECT RAISE(ABORT,'Builder versions are immutable'); END;
CREATE TRIGGER builder_deployment_no_update BEFORE UPDATE ON builder_scenario_deployments BEGIN SELECT RAISE(ABORT,'Builder deployment history is immutable'); END;
CREATE TRIGGER builder_deployment_no_delete BEFORE DELETE ON builder_scenario_deployments BEGIN SELECT RAISE(ABORT,'Builder deployment history is immutable'); END;
