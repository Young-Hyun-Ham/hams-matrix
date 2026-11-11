-- Preserve every existing personal theme/accent as a custom selection.
ALTER TABLE user_preferences ADD COLUMN theme_preset TEXT NOT NULL DEFAULT 'custom'
  CHECK(theme_preset IN ('custom','light-orange','light-blue','light-green','dark-orange','dark-blue','dark-green'));
