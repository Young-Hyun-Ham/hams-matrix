-- Independent chatbot. No AI Chat data is migrated or referenced.
CREATE TABLE chatbot_conversations (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), user_id TEXT NOT NULL REFERENCES users(id),
 project_id TEXT REFERENCES projects(id), create_request_id TEXT NOT NULL, create_payload_hash TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 100), title_source TEXT NOT NULL DEFAULT 'auto',
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), next_seq INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
 UNIQUE(workspace_id,user_id,id), UNIQUE(workspace_id,user_id,create_request_id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES workspace_members(workspace_id,user_id)
);
CREATE INDEX chatbot_rooms ON chatbot_conversations(workspace_id,user_id,deleted_at,updated_at DESC,id DESC);
CREATE TABLE chatbot_user_settings (
 workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),
 version INTEGER NOT NULL CHECK(version>0), updated_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,user_id), FOREIGN KEY(workspace_id,user_id) REFERENCES workspace_members(workspace_id,user_id)
);
CREATE TABLE chatbot_scenario_runs (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('builder-simulation','chatbot')),
 conversation_id TEXT, scenario_id TEXT, scenario_title TEXT NOT NULL, create_request_id TEXT NOT NULL, create_payload_hash TEXT NOT NULL,
 definition_hash TEXT NOT NULL, snapshot_ciphertext TEXT NOT NULL, version_ref TEXT,
 status TEXT NOT NULL CHECK(status IN ('queued','running','waiting_input','waiting_review','waiting_policy_approval','resumable','completed','failed','cancelled','interrupted','unknown')),
 current_node_id TEXT, checkpoint_ciphertext TEXT NOT NULL, next_seq INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1,
 lease_until TEXT, error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT,
 UNIQUE(workspace_id,user_id,id), UNIQUE(workspace_id,user_id,create_request_id),
 CHECK(source!='builder-simulation' OR conversation_id IS NULL),
 FOREIGN KEY(workspace_id,user_id) REFERENCES workspace_members(workspace_id,user_id),
 FOREIGN KEY(workspace_id,user_id,conversation_id) REFERENCES chatbot_conversations(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,scenario_id) REFERENCES builder_scenarios(workspace_id,id)
);
CREATE INDEX chatbot_runs ON chatbot_scenario_runs(workspace_id,user_id,source,created_at DESC,id DESC);
CREATE TABLE chatbot_turns (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
 seq INTEGER NOT NULL CHECK(seq>0), mode TEXT NOT NULL CHECK(mode IN ('chat','image','file')), model_id TEXT NOT NULL,
 logical_request_id TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
 UNIQUE(workspace_id,user_id,id), UNIQUE(conversation_id,seq), UNIQUE(workspace_id,user_id,conversation_id,id),
 FOREIGN KEY(workspace_id,user_id,conversation_id) REFERENCES chatbot_conversations(workspace_id,user_id,id)
);
CREATE TABLE chatbot_messages (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL, turn_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('user','assistant')), content_json TEXT NOT NULL CHECK(json_valid(content_json)), created_at TEXT NOT NULL,
 UNIQUE(turn_id,role), FOREIGN KEY(workspace_id,user_id,conversation_id,turn_id) REFERENCES chatbot_turns(workspace_id,user_id,conversation_id,id)
);
CREATE TABLE chatbot_requests (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, conversation_id TEXT, run_id TEXT, turn_id TEXT,
 logical_request_id TEXT NOT NULL, operation TEXT NOT NULL, client_request_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('chat','image','file','scenario')), model_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','running','waiting_review','waiting_policy_approval','completed','failed','cancelled','unknown')),
 input_ciphertext TEXT NOT NULL, attachment_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(attachment_ids_json)), result_ciphertext TEXT, error_code TEXT, stop_requested INTEGER NOT NULL DEFAULT 0 CHECK(stop_requested IN (0,1)),
 lease_until TEXT, provider_response_id TEXT, policy_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, finished_at TEXT,
 UNIQUE(workspace_id,user_id,id), UNIQUE(workspace_id,user_id,operation,client_request_id),
 CHECK((conversation_id IS NOT NULL)+(run_id IS NOT NULL)=1), CHECK(run_id IS NULL OR turn_id IS NULL),
 FOREIGN KEY(workspace_id,user_id,conversation_id) REFERENCES chatbot_conversations(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id,run_id) REFERENCES chatbot_scenario_runs(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id,conversation_id,turn_id) REFERENCES chatbot_turns(workspace_id,user_id,conversation_id,id)
);
CREATE UNIQUE INDEX chatbot_active_room ON chatbot_requests(conversation_id) WHERE status IN ('queued','running');
CREATE INDEX chatbot_jobs ON chatbot_requests(status,lease_until,created_at);
CREATE TABLE chatbot_attachments (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
 name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 8388608),
 sha256 TEXT NOT NULL, storage_key TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ready','deleted')), expires_at TEXT NOT NULL,
 UNIQUE(workspace_id,user_id,id), FOREIGN KEY(workspace_id,user_id,conversation_id) REFERENCES chatbot_conversations(workspace_id,user_id,id)
);
CREATE TABLE chatbot_artifacts (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, conversation_id TEXT, run_id TEXT,
 kind TEXT NOT NULL CHECK(kind IN ('image','file')), title TEXT NOT NULL, current_version_id TEXT, version INTEGER NOT NULL DEFAULT 0,
 deleted_at TEXT, created_at TEXT NOT NULL, UNIQUE(workspace_id,user_id,id),
 CHECK((conversation_id IS NOT NULL)+(run_id IS NOT NULL)=1),
 FOREIGN KEY(workspace_id,user_id,conversation_id) REFERENCES chatbot_conversations(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id,run_id) REFERENCES chatbot_scenario_runs(workspace_id,user_id,id)
);
CREATE TABLE chatbot_artifact_versions (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, artifact_id TEXT NOT NULL,
 version_number INTEGER NOT NULL CHECK(version_number>0), base_version_id TEXT, request_id TEXT NOT NULL,
 format TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes>0), sha256 TEXT NOT NULL,
 storage_key TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('candidate','published','rejected')), created_at TEXT NOT NULL,
 UNIQUE(workspace_id,user_id,id), UNIQUE(artifact_id,version_number), UNIQUE(artifact_id,id),
 FOREIGN KEY(workspace_id,user_id,artifact_id) REFERENCES chatbot_artifacts(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id,request_id) REFERENCES chatbot_requests(workspace_id,user_id,id),
 FOREIGN KEY(artifact_id,base_version_id) REFERENCES chatbot_artifact_versions(artifact_id,id)
);
CREATE TRIGGER chatbot_current_version BEFORE UPDATE OF current_version_id ON chatbot_artifacts WHEN NEW.current_version_id IS NOT NULL
BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM chatbot_artifact_versions v WHERE v.artifact_id=NEW.id AND v.id=NEW.current_version_id AND v.status='published') THEN RAISE(ABORT,'Invalid artifact version') END; END;
CREATE TABLE chatbot_reviews (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, request_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('artifact','scenario-api')), status TEXT NOT NULL CHECK(status IN ('pending','approved','applied','rejected','expired','invalidated')),
 version INTEGER NOT NULL DEFAULT 1, payload_ciphertext TEXT NOT NULL, payload_hash TEXT NOT NULL,
 source_hash TEXT NOT NULL, policy_version INTEGER NOT NULL, expires_at TEXT NOT NULL,
 decided_by TEXT, decided_at TEXT, created_at TEXT NOT NULL,
 UNIQUE(workspace_id,user_id,id), FOREIGN KEY(workspace_id,user_id,request_id) REFERENCES chatbot_requests(workspace_id,user_id,id)
);
CREATE UNIQUE INDEX chatbot_pending_review ON chatbot_reviews(request_id) WHERE status='pending';
CREATE TABLE chatbot_policy_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, request_id TEXT NOT NULL,
 stage TEXT NOT NULL, policy_version INTEGER NOT NULL, rule_codes_json TEXT NOT NULL CHECK(json_valid(rule_codes_json)),
 operation_hash TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(workspace_id,user_id,id), FOREIGN KEY(workspace_id,user_id,request_id) REFERENCES chatbot_requests(workspace_id,user_id,id)
);
CREATE TABLE chatbot_policy_approvals (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, request_id TEXT NOT NULL, event_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('awaiting_choice','pending','approved','rejected','cancelled','expired','invalidated','resuming','completed')),
 version INTEGER NOT NULL DEFAULT 1, operation_hash TEXT NOT NULL, policy_version INTEGER NOT NULL,
 checkpoint_ciphertext TEXT NOT NULL, expires_at TEXT NOT NULL, decided_by TEXT, comment TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
 UNIQUE(workspace_id,user_id,id), FOREIGN KEY(workspace_id,user_id,request_id) REFERENCES chatbot_requests(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id,event_id) REFERENCES chatbot_policy_events(workspace_id,user_id,id)
);
CREATE INDEX chatbot_policy_queue ON chatbot_policy_approvals(workspace_id,status,created_at,id);
CREATE TABLE chatbot_approval_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, review_id TEXT, policy_approval_id TEXT,
 actor_id TEXT NOT NULL REFERENCES users(id), event_type TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
 CHECK((review_id IS NOT NULL)+(policy_approval_id IS NOT NULL)=1),
 FOREIGN KEY(workspace_id,user_id,review_id) REFERENCES chatbot_reviews(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id,policy_approval_id) REFERENCES chatbot_policy_approvals(workspace_id,user_id,id)
);
CREATE TABLE chatbot_scenario_run_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, run_id TEXT NOT NULL, seq INTEGER NOT NULL CHECK(seq>0),
 node_id TEXT, node_attempt INTEGER NOT NULL DEFAULT 0, event_type TEXT NOT NULL, payload_ciphertext TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(run_id,seq), FOREIGN KEY(workspace_id,user_id,run_id) REFERENCES chatbot_scenario_runs(workspace_id,user_id,id)
);
CREATE TABLE chatbot_usage (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, request_id TEXT NOT NULL, call_index INTEGER NOT NULL,
 purpose TEXT NOT NULL, model_id TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER, image_count INTEGER,
 status TEXT NOT NULL CHECK(status IN ('started','completed','failed','unknown')), created_at TEXT NOT NULL,
 UNIQUE(request_id,call_index), FOREIGN KEY(workspace_id,user_id,request_id) REFERENCES chatbot_requests(workspace_id,user_id,id)
);
CREATE INDEX chatbot_usage_owner ON chatbot_usage(workspace_id,user_id,created_at);
CREATE TABLE chatbot_blob_uploads (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('staged','linked')), created_at TEXT NOT NULL,
 FOREIGN KEY(workspace_id,user_id) REFERENCES workspace_members(workspace_id,user_id)
);
CREATE INDEX chatbot_blob_staging ON chatbot_blob_uploads(status,created_at);
CREATE TRIGGER chatbot_events_immutable_update BEFORE UPDATE ON chatbot_scenario_run_events BEGIN SELECT RAISE(ABORT,'Append-only'); END;
CREATE TRIGGER chatbot_events_immutable_delete BEFORE DELETE ON chatbot_scenario_run_events BEGIN SELECT RAISE(ABORT,'Append-only'); END;
CREATE TRIGGER chatbot_approval_immutable_update BEFORE UPDATE ON chatbot_approval_events BEGIN SELECT RAISE(ABORT,'Append-only'); END;
CREATE TRIGGER chatbot_approval_immutable_delete BEFORE DELETE ON chatbot_approval_events BEGIN SELECT RAISE(ABORT,'Append-only'); END;
CREATE TRIGGER chatbot_version_content_immutable BEFORE UPDATE OF storage_key,sha256,artifact_id,base_version_id,request_id ON chatbot_artifact_versions BEGIN SELECT RAISE(ABORT,'Immutable content'); END;
CREATE TRIGGER chatbot_version_no_delete BEFORE DELETE ON chatbot_artifact_versions BEGIN SELECT RAISE(ABORT,'Immutable version'); END;
CREATE TRIGGER chatbot_room_identity BEFORE UPDATE OF workspace_id,user_id,project_id ON chatbot_conversations BEGIN SELECT RAISE(ABORT,'Immutable scope'); END;
