ALTER TABLE ai_conversations ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0 CHECK(is_pinned IN (0,1));
CREATE INDEX idx_ai_conversations_pinned ON ai_conversations(workspace_id,user_id,project_id,is_pinned DESC,updated_at DESC,conv_id DESC);
