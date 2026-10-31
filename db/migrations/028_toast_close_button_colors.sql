ALTER TABLE user_preferences ADD COLUMN toast_close_button_color TEXT DEFAULT NULL
  CHECK(toast_close_button_color IS NULL OR (length(toast_close_button_color)=7 AND substr(toast_close_button_color,1,1)='#' AND substr(toast_close_button_color,2) NOT GLOB '*[^0-9a-fA-F]*'));
ALTER TABLE user_preferences ADD COLUMN toast_close_button_background_color TEXT DEFAULT NULL
  CHECK(toast_close_button_background_color IS NULL OR (length(toast_close_button_background_color)=7 AND substr(toast_close_button_background_color,1,1)='#' AND substr(toast_close_button_background_color,2) NOT GLOB '*[^0-9a-fA-F]*'));
