CREATE TABLE wbs_images (
  project_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL UNIQUE,
  source_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png' CHECK(mime_type='image/png'),
  byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 8388608),
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 4096),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 4096),
  encryption_version INTEGER NOT NULL CHECK(encryption_version=1),
  key_id TEXT NOT NULL,
  iv_base64 TEXT NOT NULL,
  tag_base64 TEXT NOT NULL,
  ciphertext_base64 TEXT NOT NULL,
  FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);
CREATE TABLE wbs_image_generations (
  project_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(project_id,workspace_id) REFERENCES projects(id,workspace_id)
);
