ALTER TABLE user_preferences ADD COLUMN accent_color TEXT DEFAULT NULL
  CHECK(accent_color IS NULL OR (length(accent_color)=7 AND substr(accent_color,1,1)='#' AND substr(accent_color,2) NOT GLOB '*[^0-9a-fA-F]*'));
