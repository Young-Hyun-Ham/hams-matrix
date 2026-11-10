ALTER TABLE project_database_domains ADD COLUMN database_type TEXT
  CHECK(database_type IS NULL OR database_type IN ('turso','postgresql','mysql','oracle'));
