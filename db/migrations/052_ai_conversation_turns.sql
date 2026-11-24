-- Stable question order, independent approvals, and compatibility for 051 checkpoints.
CREATE TABLE ai_conversation_turns (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 turn_id TEXT NOT NULL UNIQUE,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 project_id TEXT REFERENCES projects(id),
 conv_id TEXT NOT NULL REFERENCES ai_conversations(conv_id) ON DELETE CASCADE,
 logical_request_id TEXT NOT NULL,
 status TEXT NOT NULL,
 final_chat_id TEXT UNIQUE REFERENCES ai_prompt_chats(id) ON DELETE CASCADE,
 prompt_excerpt TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 completed_at TEXT,
 version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_ai_turn_room ON ai_conversation_turns(workspace_id,user_id,conv_id,seq);
INSERT INTO ai_conversation_turns(turn_id,workspace_id,user_id,project_id,conv_id,logical_request_id,status,final_chat_id,created_at,completed_at)
 SELECT id,workspace_id,user_id,project_id,conv_id,id,'completed',id,created_at,created_at
 FROM ai_prompt_chats ORDER BY rowid;

ALTER TABLE ai_guardrail_approvals ADD COLUMN turn_id TEXT REFERENCES ai_conversation_turns(turn_id) ON DELETE SET NULL;
ALTER TABLE ai_guardrail_approvals ADD COLUMN context_version INTEGER NOT NULL DEFAULT 1;
-- Old encrypted checkpoints are retained, never guessed or rewritten. Their room
-- keeps the old wait/hash rules until the last legacy request is terminal.
INSERT INTO ai_conversation_turns(turn_id,workspace_id,user_id,project_id,conv_id,logical_request_id,status,prompt_excerpt,created_at)
 SELECT 'approval:'||a.logical_request_id,a.workspace_id,a.user_id,a.project_id,a.conv_id,a.logical_request_id,a.status,a.prompt_excerpt,a.created_at
 FROM ai_guardrail_approvals a JOIN ai_conversations c ON c.conv_id=a.conv_id
 WHERE a.rowid=(SELECT MAX(b.rowid) FROM ai_guardrail_approvals b WHERE b.logical_request_id=a.logical_request_id AND b.workspace_id=a.workspace_id AND b.user_id=a.user_id)
 ORDER BY a.created_at,a.rowid;
UPDATE ai_guardrail_approvals SET turn_id='approval:'||logical_request_id
 WHERE EXISTS(SELECT 1 FROM ai_conversation_turns t WHERE t.turn_id='approval:'||logical_request_id);
-- Recover already completed legacy answer links from existing saved usage.
UPDATE ai_guardrail_approvals SET turn_id=(
 SELECT c.id FROM ai_token_usage u JOIN ai_prompt_chats c ON c.id=u.chat_id
 WHERE u.request_id=ai_guardrail_approvals.attempt_request_id AND u.chat_saved=1
 AND c.workspace_id=ai_guardrail_approvals.workspace_id AND c.user_id=ai_guardrail_approvals.user_id
 AND c.conv_id=ai_guardrail_approvals.conv_id LIMIT 1
) WHERE status='completed' AND EXISTS(
 SELECT 1 FROM ai_token_usage u JOIN ai_prompt_chats c ON c.id=u.chat_id
 WHERE u.request_id=ai_guardrail_approvals.attempt_request_id AND u.chat_saved=1
 AND c.workspace_id=ai_guardrail_approvals.workspace_id AND c.user_id=ai_guardrail_approvals.user_id
 AND c.conv_id=ai_guardrail_approvals.conv_id
);
DELETE FROM ai_conversation_turns WHERE turn_id LIKE 'approval:%'
 AND NOT EXISTS(SELECT 1 FROM ai_guardrail_approvals a WHERE a.turn_id=ai_conversation_turns.turn_id);
DROP INDEX idx_guardrail_approval_active;
CREATE UNIQUE INDEX idx_guardrail_approval_active ON ai_guardrail_approvals(workspace_id,user_id,logical_request_id)
 WHERE status IN ('awaiting_choice','pending','approved','resuming');
CREATE INDEX idx_guardrail_approval_turn ON ai_guardrail_approvals(turn_id,created_at);

-- Existing insert callers and fixtures remain compatible. A resumed answer uses
-- its original turn ID, so this updates that position instead of appending it.
CREATE TRIGGER ai_chat_turn_insert AFTER INSERT ON ai_prompt_chats BEGIN
 INSERT INTO ai_conversation_turns(turn_id,workspace_id,user_id,project_id,conv_id,logical_request_id,status,final_chat_id,created_at,completed_at)
 VALUES(NEW.id,NEW.workspace_id,NEW.user_id,NEW.project_id,NEW.conv_id,NEW.id,'completed',NEW.id,NEW.created_at,NEW.created_at)
 ON CONFLICT(turn_id) DO UPDATE SET status='completed',final_chat_id=NEW.id,completed_at=NEW.created_at,version=version+1;
END;
