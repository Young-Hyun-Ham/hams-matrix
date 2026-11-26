ALTER TABLE builder_scenarios ADD COLUMN command_enabled INTEGER NOT NULL DEFAULT 0 CHECK (command_enabled IN (0, 1));
