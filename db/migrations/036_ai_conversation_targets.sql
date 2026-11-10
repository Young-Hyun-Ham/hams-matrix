ALTER TABLE ai_conversations ADD COLUMN target_page TEXT CHECK(target_page IS NULL OR target_page IN ('overview','rfp','wbs','architecture','requirement','screen','database','program','test','trace','acceptance','history','export','documents','dashboard','team'));
ALTER TABLE ai_conversations ADD COLUMN target_version INTEGER NOT NULL DEFAULT 0 CHECK(typeof(target_version)='integer' AND target_version >= 0);
ALTER TABLE ai_prompt_chats ADD COLUMN target_page TEXT;
ALTER TABLE ai_prompt_chats ADD COLUMN target_version INTEGER;
ALTER TABLE ai_generation_requests ADD COLUMN target_page TEXT;
ALTER TABLE ai_generation_requests ADD COLUMN target_version INTEGER;

-- Recover the latest valid execution location, never a display title. Preserve all messages.
UPDATE ai_conversations AS c SET target_page=(
  SELECT CASE
    WHEN c.project_id IS NOT NULL THEN
      CASE WHEN h.tab IN ('overview','rfp','wbs','architecture','requirement','screen','database','program','test','trace','acceptance','history','export','documents') THEN h.tab
        WHEN h.pathname='/requirements' THEN 'requirement' WHEN h.pathname='/screens' THEN 'screen'
        WHEN h.pathname='/specifications' THEN 'program' WHEN h.pathname='/history' THEN 'history'
        WHEN h.pathname='/deliverables' THEN 'export' END
    WHEN h.tab IS NULL AND h.pathname='/dashboard' THEN 'dashboard'
    WHEN h.tab IS NULL AND h.pathname='/team' THEN 'team' END
  FROM ai_prompt_chats h
  WHERE h.conv_id=c.conv_id AND h.workspace_id=c.workspace_id AND h.user_id=c.user_id AND h.project_id IS c.project_id
    AND ((c.project_id IS NOT NULL AND (h.pathname='/projects/'||c.project_id OR h.pathname IN ('/requirements','/screens','/specifications','/history','/deliverables'))
      AND (h.tab IN ('overview','rfp','wbs','architecture','requirement','screen','database','program','test','trace','acceptance','history','export','documents')
        OR (h.tab IS NULL AND h.pathname IN ('/requirements','/screens','/specifications','/history','/deliverables'))))
      OR (c.project_id IS NULL AND h.tab IS NULL AND h.pathname IN ('/dashboard','/team')))
  ORDER BY h.rowid DESC LIMIT 1
);
UPDATE ai_conversations SET target_version=1 WHERE target_page IS NOT NULL;

CREATE TRIGGER ai_conversation_target_scope_insert BEFORE INSERT ON ai_conversations
WHEN NEW.target_page IS NOT NULL AND ((NEW.project_id IS NULL AND NEW.target_page NOT IN ('dashboard','team')) OR (NEW.project_id IS NOT NULL AND NEW.target_page IN ('dashboard','team')))
BEGIN SELECT RAISE(ABORT,'Invalid AI target scope'); END;
CREATE TRIGGER ai_conversation_target_scope_update BEFORE UPDATE OF target_page,project_id ON ai_conversations
WHEN NEW.target_page IS NOT NULL AND ((NEW.project_id IS NULL AND NEW.target_page NOT IN ('dashboard','team')) OR (NEW.project_id IS NOT NULL AND NEW.target_page IN ('dashboard','team')))
BEGIN SELECT RAISE(ABORT,'Invalid AI target scope'); END;
