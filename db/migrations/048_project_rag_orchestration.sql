-- Project knowledge is separate from private conversations and immutable business history.
ALTER TABLE ai_prompt_chats ADD COLUMN rag_references_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(rag_references_json));
CREATE TABLE project_ai_credentials (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
 provider TEXT NOT NULL DEFAULT 'openai' CHECK(provider='openai'),
 ciphertext TEXT NOT NULL, iv TEXT NOT NULL, auth_tag TEXT NOT NULL,
 encryption_version INTEGER NOT NULL DEFAULT 1 CHECK(encryption_version=1), key_id TEXT NOT NULL,
 key_fingerprint TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL,
 revoked_at TEXT, created_at TEXT NOT NULL,
 UNIQUE(id,project_id,workspace_id),
 FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);
CREATE TABLE project_rag_generations (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('building','ready','retired','failed','cancelled')),
 config_version INTEGER NOT NULL, model TEXT NOT NULL CHECK(model LIKE 'text-embedding%'),
 dimensions INTEGER NOT NULL DEFAULT 0 CHECK(dimensions>=0), chunker_version INTEGER NOT NULL DEFAULT 1,
 scope_version INTEGER NOT NULL DEFAULT 1, credential_id TEXT NOT NULL, credential_version INTEGER NOT NULL,
 manifest_hash TEXT NOT NULL DEFAULT '', source_count INTEGER NOT NULL DEFAULT 0,
 chunk_count INTEGER NOT NULL DEFAULT 0, coverage_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(coverage_json)),
 started_at TEXT NOT NULL, completed_at TEXT, published_at TEXT,
 UNIQUE(id,project_id,workspace_id),
 FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id),
 FOREIGN KEY(credential_id,project_id,workspace_id) REFERENCES project_ai_credentials(id,project_id,workspace_id)
);
CREATE TABLE project_rag_jobs (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, generation_id TEXT NOT NULL,
 requested_by TEXT NOT NULL, idempotency_key TEXT NOT NULL, input_hash TEXT NOT NULL,
 config_version INTEGER NOT NULL, credential_id TEXT NOT NULL, credential_version INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','running','stop_requested','publishing','completed','failed','cancelled')),
 total_sources INTEGER NOT NULL DEFAULT 0, processed_sources INTEGER NOT NULL DEFAULT 0,
 total_chunks INTEGER NOT NULL DEFAULT 0, completed_chunks INTEGER NOT NULL DEFAULT 0,
 failed_sources INTEGER NOT NULL DEFAULT 0, skipped_sources INTEGER NOT NULL DEFAULT 0,
 reused_chunks INTEGER NOT NULL DEFAULT 0, cursor_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(cursor_json)),
 attempt INTEGER NOT NULL DEFAULT 0, call_index INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_until TEXT, heartbeat_at TEXT, error_code TEXT,
 created_at TEXT NOT NULL, finished_at TEXT,
 UNIQUE(id,project_id,workspace_id), UNIQUE(workspace_id,project_id,idempotency_key),
 FOREIGN KEY(generation_id,project_id,workspace_id) REFERENCES project_rag_generations(id,project_id,workspace_id),
 FOREIGN KEY(credential_id,project_id,workspace_id) REFERENCES project_ai_credentials(id,project_id,workspace_id)
);
CREATE UNIQUE INDEX idx_rag_active_job ON project_rag_jobs(workspace_id,project_id)
 WHERE status IN ('queued','running','stop_requested','publishing');
CREATE INDEX idx_rag_queue ON project_rag_jobs(status,lease_until,created_at);
CREATE TABLE project_rag_configs (
 workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'openai',
 model TEXT NOT NULL, credential_id TEXT NOT NULL, version INTEGER NOT NULL,
 active_generation_id TEXT, last_attempt_job_id TEXT, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,project_id),
 FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id),
 FOREIGN KEY(credential_id,project_id,workspace_id) REFERENCES project_ai_credentials(id,project_id,workspace_id),
 FOREIGN KEY(active_generation_id,project_id,workspace_id) REFERENCES project_rag_generations(id,project_id,workspace_id),
 FOREIGN KEY(last_attempt_job_id,project_id,workspace_id) REFERENCES project_rag_jobs(id,project_id,workspace_id)
);
CREATE TABLE project_rag_sources (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, generation_id TEXT NOT NULL,
 source_type TEXT NOT NULL, source_id TEXT NOT NULL, source_version TEXT NOT NULL, content_hash TEXT NOT NULL,
 permission_tab TEXT NOT NULL, title TEXT NOT NULL, locator_json TEXT NOT NULL CHECK(json_valid(locator_json)),
 extraction_status TEXT NOT NULL CHECK(extraction_status IN ('pending','ready','unsupported','failed')),
 extraction_error_code TEXT, chunk_count INTEGER NOT NULL DEFAULT 0,
 UNIQUE(id,generation_id,project_id,workspace_id), UNIQUE(generation_id,source_type,source_id),
 FOREIGN KEY(generation_id,project_id,workspace_id) REFERENCES project_rag_generations(id,project_id,workspace_id)
);
CREATE INDEX idx_rag_sources_scope ON project_rag_sources(workspace_id,project_id,generation_id);
CREATE TABLE project_rag_chunks (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, generation_id TEXT NOT NULL,
 source_record_id TEXT NOT NULL, chunk_no INTEGER NOT NULL, section TEXT NOT NULL,
 content TEXT NOT NULL, content_hash TEXT NOT NULL, token_count INTEGER NOT NULL,
 embedding BLOB NOT NULL, dimensions INTEGER NOT NULL CHECK(dimensions>0), created_at TEXT NOT NULL,
 UNIQUE(source_record_id,chunk_no), CHECK(length(embedding)=dimensions*4),
 FOREIGN KEY(source_record_id,generation_id,project_id,workspace_id) REFERENCES project_rag_sources(id,generation_id,project_id,workspace_id)
);
CREATE INDEX idx_rag_chunks_scope ON project_rag_chunks(workspace_id,project_id,generation_id,id);
CREATE TABLE ai_orchestration_events (
 id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,user_id TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE,classifier_version INTEGER NOT NULL,primary_intent TEXT NOT NULL,
 route_flags_json TEXT NOT NULL CHECK(json_valid(route_flags_json)),reason_code TEXT NOT NULL,
 generation_id TEXT,source_refs_json TEXT NOT NULL CHECK(json_valid(source_refs_json)),
 fallback_code TEXT,duration_ms INTEGER NOT NULL,created_at TEXT NOT NULL,
 FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);
CREATE INDEX idx_orchestration_time ON ai_orchestration_events(workspace_id,created_at);
CREATE TRIGGER rag_active_ready_insert BEFORE INSERT ON project_rag_configs
 WHEN NEW.active_generation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM project_rag_generations WHERE id=NEW.active_generation_id AND project_id=NEW.project_id AND workspace_id=NEW.workspace_id AND status='ready')
 BEGIN SELECT RAISE(ABORT,'Active RAG generation must be ready'); END;
CREATE TRIGGER rag_active_ready_update BEFORE UPDATE OF active_generation_id ON project_rag_configs
 WHEN NEW.active_generation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM project_rag_generations WHERE id=NEW.active_generation_id AND project_id=NEW.project_id AND workspace_id=NEW.workspace_id AND status='ready')
 BEGIN SELECT RAISE(ABORT,'Active RAG generation must be ready'); END;
