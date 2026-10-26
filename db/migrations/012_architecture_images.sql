CREATE TABLE architecture_images (
  artifact_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL UNIQUE,
  artifact_version INTEGER NOT NULL CHECK(artifact_version > 0),
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
  FOREIGN KEY(artifact_id,project_id,workspace_id) REFERENCES project_artifacts(id,project_id,workspace_id)
);
CREATE TABLE architecture_image_generations (
  artifact_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(artifact_id,project_id,workspace_id) REFERENCES project_artifacts(id,project_id,workspace_id)
);
