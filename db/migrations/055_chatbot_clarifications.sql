CREATE TABLE _chatbot_migration_guard(n INTEGER NOT NULL CHECK(n=0));
INSERT INTO _chatbot_migration_guard SELECT (SELECT COUNT(*) FROM chatbot_requests WHERE status IN ('queued','running'))+(SELECT COUNT(*) FROM chatbot_scenario_runs WHERE status IN ('queued','running'));
-- Replace the request FK subgraph atomically with foreign_keys ON. No global FK disable.
CREATE TABLE _clarification_backup_chatbot_requests AS SELECT * FROM chatbot_requests;
CREATE TABLE _clarification_backup_chatbot_artifact_versions AS SELECT * FROM chatbot_artifact_versions;
CREATE TABLE _clarification_backup_chatbot_reviews AS SELECT * FROM chatbot_reviews;
CREATE TABLE _clarification_backup_chatbot_policy_events AS SELECT * FROM chatbot_policy_events;
CREATE TABLE _clarification_backup_chatbot_policy_approvals AS SELECT * FROM chatbot_policy_approvals;
CREATE TABLE _clarification_backup_chatbot_approval_events AS SELECT * FROM chatbot_approval_events;
CREATE TABLE _clarification_backup_chatbot_usage AS SELECT * FROM chatbot_usage;
DROP TABLE chatbot_usage;
DROP TABLE chatbot_approval_events;
DROP TABLE chatbot_policy_approvals;
DROP TABLE chatbot_policy_events;
DROP TABLE chatbot_reviews;
DROP TABLE chatbot_artifact_versions;
DROP TABLE chatbot_requests;
CREATE TABLE chatbot_requests (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, conversation_id TEXT, run_id TEXT, turn_id TEXT,
 logical_request_id TEXT NOT NULL, operation TEXT NOT NULL, client_request_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('chat','image','file','scenario')), model_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','running','waiting_review','waiting_clarification','waiting_policy_approval','completed','failed','cancelled','unknown')),
 input_ciphertext TEXT NOT NULL, attachment_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(attachment_ids_json)), result_ciphertext TEXT, error_code TEXT, stop_requested INTEGER NOT NULL DEFAULT 0 CHECK(stop_requested IN (0,1)),
 lease_until TEXT, provider_response_id TEXT, policy_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, finished_at TEXT,
 UNIQUE(workspace_id,user_id,id), UNIQUE(workspace_id,user_id,operation,client_request_id),
 CHECK((conversation_id IS NOT NULL)+(run_id IS NOT NULL)=1), CHECK(run_id IS NULL OR turn_id IS NULL),
 FOREIGN KEY(workspace_id,user_id,conversation_id) REFERENCES chatbot_conversations(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id,run_id) REFERENCES chatbot_scenario_runs(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id,conversation_id,turn_id) REFERENCES chatbot_turns(workspace_id,user_id,conversation_id,id)
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
CREATE TABLE chatbot_reviews (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, request_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('artifact','scenario-api')), status TEXT NOT NULL CHECK(status IN ('pending','approved','applied','rejected','expired','invalidated')),
 version INTEGER NOT NULL DEFAULT 1, payload_ciphertext TEXT NOT NULL, payload_hash TEXT NOT NULL,
 source_hash TEXT NOT NULL, policy_version INTEGER NOT NULL, expires_at TEXT NOT NULL,
 decided_by TEXT, decided_at TEXT, created_at TEXT NOT NULL,
 UNIQUE(workspace_id,user_id,id), FOREIGN KEY(workspace_id,user_id,request_id) REFERENCES chatbot_requests(workspace_id,user_id,id)
);
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
CREATE TABLE chatbot_approval_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, review_id TEXT, policy_approval_id TEXT,
 actor_id TEXT NOT NULL REFERENCES users(id), event_type TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
 CHECK((review_id IS NOT NULL)+(policy_approval_id IS NOT NULL)=1),
 FOREIGN KEY(workspace_id,user_id,review_id) REFERENCES chatbot_reviews(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id,policy_approval_id) REFERENCES chatbot_policy_approvals(workspace_id,user_id,id)
);
CREATE TABLE chatbot_usage (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, request_id TEXT NOT NULL, call_index INTEGER NOT NULL,
 purpose TEXT NOT NULL, model_id TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER, image_count INTEGER,
 status TEXT NOT NULL CHECK(status IN ('started','completed','failed','unknown')), created_at TEXT NOT NULL,
 UNIQUE(request_id,call_index), FOREIGN KEY(workspace_id,user_id,request_id) REFERENCES chatbot_requests(workspace_id,user_id,id)
);
INSERT INTO chatbot_requests SELECT * FROM _clarification_backup_chatbot_requests;
INSERT INTO _chatbot_migration_guard SELECT COUNT(*) FROM (SELECT * FROM _clarification_backup_chatbot_requests EXCEPT SELECT * FROM chatbot_requests);
DROP TABLE _clarification_backup_chatbot_requests;
INSERT INTO chatbot_artifact_versions SELECT * FROM _clarification_backup_chatbot_artifact_versions;
INSERT INTO _chatbot_migration_guard SELECT COUNT(*) FROM (SELECT * FROM _clarification_backup_chatbot_artifact_versions EXCEPT SELECT * FROM chatbot_artifact_versions);
DROP TABLE _clarification_backup_chatbot_artifact_versions;
INSERT INTO chatbot_reviews SELECT * FROM _clarification_backup_chatbot_reviews;
INSERT INTO _chatbot_migration_guard SELECT COUNT(*) FROM (SELECT * FROM _clarification_backup_chatbot_reviews EXCEPT SELECT * FROM chatbot_reviews);
DROP TABLE _clarification_backup_chatbot_reviews;
INSERT INTO chatbot_policy_events SELECT * FROM _clarification_backup_chatbot_policy_events;
INSERT INTO _chatbot_migration_guard SELECT COUNT(*) FROM (SELECT * FROM _clarification_backup_chatbot_policy_events EXCEPT SELECT * FROM chatbot_policy_events);
DROP TABLE _clarification_backup_chatbot_policy_events;
INSERT INTO chatbot_policy_approvals SELECT * FROM _clarification_backup_chatbot_policy_approvals;
INSERT INTO _chatbot_migration_guard SELECT COUNT(*) FROM (SELECT * FROM _clarification_backup_chatbot_policy_approvals EXCEPT SELECT * FROM chatbot_policy_approvals);
DROP TABLE _clarification_backup_chatbot_policy_approvals;
INSERT INTO chatbot_approval_events SELECT * FROM _clarification_backup_chatbot_approval_events;
INSERT INTO _chatbot_migration_guard SELECT COUNT(*) FROM (SELECT * FROM _clarification_backup_chatbot_approval_events EXCEPT SELECT * FROM chatbot_approval_events);
DROP TABLE _clarification_backup_chatbot_approval_events;
INSERT INTO chatbot_usage SELECT * FROM _clarification_backup_chatbot_usage;
INSERT INTO _chatbot_migration_guard SELECT COUNT(*) FROM (SELECT * FROM _clarification_backup_chatbot_usage EXCEPT SELECT * FROM chatbot_usage);
DROP TABLE _clarification_backup_chatbot_usage;
CREATE UNIQUE INDEX chatbot_active_room ON chatbot_requests(conversation_id) WHERE status IN ('queued','running');
CREATE INDEX chatbot_jobs ON chatbot_requests(status,lease_until,created_at);
CREATE UNIQUE INDEX chatbot_pending_review ON chatbot_reviews(request_id) WHERE status='pending';
CREATE INDEX chatbot_policy_queue ON chatbot_policy_approvals(workspace_id,status,created_at,id);
CREATE INDEX chatbot_usage_owner ON chatbot_usage(workspace_id,user_id,created_at);
CREATE TRIGGER chatbot_approval_immutable_update BEFORE UPDATE ON chatbot_approval_events BEGIN SELECT RAISE(ABORT,'Append-only'); END;
CREATE TRIGGER chatbot_approval_immutable_delete BEFORE DELETE ON chatbot_approval_events BEGIN SELECT RAISE(ABORT,'Append-only'); END;
CREATE TRIGGER chatbot_version_content_immutable BEFORE UPDATE OF storage_key,sha256,artifact_id,base_version_id,request_id ON chatbot_artifact_versions BEGIN SELECT RAISE(ABORT,'Immutable content'); END;
CREATE TRIGGER chatbot_version_no_delete BEFORE DELETE ON chatbot_artifact_versions BEGIN SELECT RAISE(ABORT,'Immutable version'); END;
CREATE UNIQUE INDEX chatbot_request_scope ON chatbot_requests(workspace_id,user_id,conversation_id,turn_id,id);
CREATE TABLE chatbot_clarifications (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL, request_id TEXT NOT NULL, turn_id TEXT NOT NULL,
 round INTEGER NOT NULL CHECK(round BETWEEN 1 AND 3), field_key TEXT NOT NULL, intent TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','answered','cancelled','expired','invalidated')), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 input_hash TEXT NOT NULL, checkpoint_hash TEXT NOT NULL, payload_ciphertext TEXT NOT NULL, selected_ciphertext TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT,
 UNIQUE(workspace_id,user_id,id), UNIQUE(request_id,round),
 FOREIGN KEY(workspace_id,user_id,conversation_id,turn_id,request_id) REFERENCES chatbot_requests(workspace_id,user_id,conversation_id,turn_id,id)
);
CREATE UNIQUE INDEX chatbot_clarification_pending ON chatbot_clarifications(request_id) WHERE status='pending';
CREATE INDEX chatbot_clarification_owner ON chatbot_clarifications(workspace_id,user_id,request_id,round);
CREATE TABLE chatbot_clarification_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, clarification_id TEXT NOT NULL, request_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('presented','answered','cancelled','expired','invalidated')),
 client_request_id TEXT NOT NULL, payload_hash TEXT NOT NULL, event_ciphertext TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(workspace_id,user_id,event_type,client_request_id),
 FOREIGN KEY(workspace_id,user_id,clarification_id) REFERENCES chatbot_clarifications(workspace_id,user_id,id),
 FOREIGN KEY(workspace_id,user_id,request_id) REFERENCES chatbot_requests(workspace_id,user_id,id)
);
CREATE TABLE chatbot_request_steps (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, request_id TEXT NOT NULL, step_key TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('decision','tool','answer')), round INTEGER NOT NULL CHECK(round BETWEEN 0 AND 3), input_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('started','completed','failed','unknown')), output_ciphertext TEXT, usage_call_index INTEGER, started_at TEXT NOT NULL, completed_at TEXT,
 UNIQUE(request_id,step_key), FOREIGN KEY(workspace_id,user_id,request_id) REFERENCES chatbot_requests(workspace_id,user_id,id)
);
CREATE TRIGGER chatbot_clarification_event_update BEFORE UPDATE ON chatbot_clarification_events BEGIN SELECT RAISE(ABORT,'Append-only'); END;
CREATE TRIGGER chatbot_clarification_event_delete BEFORE DELETE ON chatbot_clarification_events BEGIN SELECT RAISE(ABORT,'Append-only'); END;
CREATE TRIGGER chatbot_step_completed_update BEFORE UPDATE ON chatbot_request_steps WHEN OLD.status='completed' BEGIN SELECT RAISE(ABORT,'Immutable completed step'); END;
CREATE TRIGGER chatbot_step_completed_delete BEFORE DELETE ON chatbot_request_steps WHEN OLD.status='completed' BEGIN SELECT RAISE(ABORT,'Immutable completed step'); END;
CREATE TRIGGER chatbot_clarification_identity BEFORE UPDATE OF workspace_id,user_id,conversation_id,request_id,turn_id,round,input_hash,checkpoint_hash,payload_ciphertext ON chatbot_clarifications BEGIN SELECT RAISE(ABORT,'Immutable clarification'); END;

INSERT INTO _chatbot_migration_guard SELECT COUNT(*) FROM pragma_foreign_key_check;
DROP TABLE _chatbot_migration_guard;
