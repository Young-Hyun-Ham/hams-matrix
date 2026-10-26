CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_chats_identity ON ai_prompt_chats(id,workspace_id,user_id);
CREATE TABLE IF NOT EXISTS ai_chat_images (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 2),
  mime_type TEXT NOT NULL CHECK(mime_type='image/png'),
  byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 2097152),
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 4096),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 4096),
  encryption_version INTEGER NOT NULL DEFAULT 1 CHECK(encryption_version=1),
  key_id TEXT NOT NULL,
  iv_base64 TEXT NOT NULL,
  tag_base64 TEXT NOT NULL,
  ciphertext_base64 TEXT NOT NULL,
  UNIQUE(chat_id,position),
  FOREIGN KEY(chat_id,workspace_id,user_id) REFERENCES ai_prompt_chats(id,workspace_id,user_id) ON DELETE CASCADE
);
