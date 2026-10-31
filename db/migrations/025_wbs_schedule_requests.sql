-- Durable idempotency receipts prevent duplicate tasks after a lost save response.
CREATE TABLE wbs_schedule_requests (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK(json_valid(response_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, project_id, user_id, request_id),
  FOREIGN KEY(project_id, workspace_id) REFERENCES projects(id, workspace_id)
);
