CREATE TABLE ai_conversations (
  conv_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT REFERENCES projects(id),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 100),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  request_id TEXT,
  busy_until TEXT
);
CREATE INDEX idx_ai_conversations_scope ON ai_conversations(workspace_id,user_id,project_id,updated_at DESC,conv_id);

-- Each former standalone request becomes its own conversation. Keep chat/image IDs unchanged.
INSERT INTO ai_conversations(conv_id,workspace_id,user_id,project_id,title,created_at,updated_at)
SELECT id,workspace_id,user_id,project_id,substr(trim(prompt),1,100),created_at,created_at
FROM ai_prompt_chats;
ALTER TABLE ai_prompt_chats ADD COLUMN conv_id TEXT REFERENCES ai_conversations(conv_id);
UPDATE ai_prompt_chats SET conv_id=id;
CREATE INDEX idx_ai_chats_conversation ON ai_prompt_chats(workspace_id,user_id,project_id,conv_id,created_at,id);
CREATE TRIGGER ai_chat_conversation_insert BEFORE INSERT ON ai_prompt_chats
WHEN NOT EXISTS (
  SELECT 1 FROM ai_conversations c WHERE c.conv_id=NEW.conv_id
    AND c.workspace_id=NEW.workspace_id AND c.user_id=NEW.user_id AND c.project_id IS NEW.project_id
)
BEGIN SELECT RAISE(ABORT,'Invalid conversation scope'); END;
CREATE TRIGGER ai_chat_conversation_update BEFORE UPDATE OF conv_id,workspace_id,user_id,project_id ON ai_prompt_chats
WHEN NOT EXISTS (
  SELECT 1 FROM ai_conversations c WHERE c.conv_id=NEW.conv_id
    AND c.workspace_id=NEW.workspace_id AND c.user_id=NEW.user_id AND c.project_id IS NEW.project_id
)
BEGIN SELECT RAISE(ABORT,'Invalid conversation scope'); END;
