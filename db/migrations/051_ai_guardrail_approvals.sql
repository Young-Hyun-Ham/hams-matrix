-- Add a terminal paused attempt without changing existing request IDs or history.
CREATE TABLE ai_generation_requests_guardrail_next (
 request_id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 conv_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('running','stop_requested','finalizing','completed','cancelled','failed','paused')),
 actions_json TEXT NOT NULL DEFAULT '[]',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 finished_at TEXT, guardrail_version INTEGER, target_page TEXT, target_version INTEGER
);
INSERT INTO ai_generation_requests_guardrail_next(request_id,workspace_id,user_id,conv_id,status,actions_json,created_at,finished_at,guardrail_version,target_page,target_version)
 SELECT request_id,workspace_id,user_id,conv_id,status,actions_json,created_at,finished_at,guardrail_version,target_page,target_version FROM ai_generation_requests;
DROP TABLE ai_generation_requests;
ALTER TABLE ai_generation_requests_guardrail_next RENAME TO ai_generation_requests;
CREATE INDEX idx_ai_generation_owner ON ai_generation_requests(workspace_id,user_id,conv_id);
CREATE TABLE ai_guardrail_approvals (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 project_id TEXT REFERENCES projects(id),
 conv_id TEXT NOT NULL,
 origin_request_id TEXT NOT NULL,
 logical_request_id TEXT NOT NULL,
 parent_id TEXT REFERENCES ai_guardrail_approvals(id),
 event_id TEXT NOT NULL REFERENCES ai_guardrail_events(id),
 policy_version INTEGER NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('input','context','tool','tool-result','output')),
 rules_json TEXT NOT NULL CHECK(json_valid(rules_json)),
 operation_key TEXT NOT NULL,
 target_page TEXT NOT NULL,
 target_version INTEGER NOT NULL,
 source_hash TEXT NOT NULL,
 prompt_excerpt TEXT NOT NULL,
 inspection_excerpt TEXT NOT NULL,
 pending_count INTEGER NOT NULL DEFAULT 0,
 image_count INTEGER NOT NULL DEFAULT 0,
 checkpoint_json TEXT CHECK(checkpoint_json IS NULL OR json_valid(checkpoint_json)),
 checkpoint_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'awaiting_choice' CHECK(status IN ('awaiting_choice','declined','pending','approved','rejected','cancelled','expired','invalidated','resuming','completed','reblocked','failed')),
 version INTEGER NOT NULL DEFAULT 1,
 comment TEXT NOT NULL DEFAULT '',
 decided_by TEXT REFERENCES users(id),
 decided_at TEXT,
 attempt_request_id TEXT,
 lease_until TEXT,
 created_at TEXT NOT NULL,
 requested_at TEXT,
 expires_at TEXT NOT NULL,
 finished_at TEXT
);
CREATE UNIQUE INDEX idx_guardrail_approval_active ON ai_guardrail_approvals(workspace_id,user_id,conv_id) WHERE status IN ('awaiting_choice','pending','approved','resuming');
CREATE INDEX idx_guardrail_approval_queue ON ai_guardrail_approvals(workspace_id,status,requested_at,id);
CREATE INDEX idx_guardrail_approval_request ON ai_guardrail_approvals(origin_request_id);
CREATE TABLE ai_guardrail_approval_events (
 id TEXT PRIMARY KEY,
 approval_id TEXT NOT NULL REFERENCES ai_guardrail_approvals(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL,
 comment TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE INDEX idx_guardrail_approval_events ON ai_guardrail_approval_events(approval_id,created_at);
CREATE TRIGGER guardrail_approval_events_no_update BEFORE UPDATE ON ai_guardrail_approval_events BEGIN SELECT RAISE(ABORT,'Append-only'); END;
CREATE TRIGGER guardrail_approval_events_no_delete BEFORE DELETE ON ai_guardrail_approval_events BEGIN SELECT RAISE(ABORT,'Append-only'); END;
