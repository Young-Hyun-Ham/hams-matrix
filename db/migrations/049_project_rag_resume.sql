-- Keep failed attempts immutable; a resumed job continues their generation/checkpoints.
ALTER TABLE project_rag_jobs ADD COLUMN restart_mode TEXT NOT NULL DEFAULT 'new' CHECK(restart_mode IN ('new','resume'));
ALTER TABLE project_rag_jobs ADD COLUMN resume_from_job_id TEXT REFERENCES project_rag_jobs(id)
 CHECK((restart_mode='resume')=(resume_from_job_id IS NOT NULL));
CREATE INDEX idx_rag_resume_parent ON project_rag_jobs(workspace_id,project_id,resume_from_job_id);
CREATE TRIGGER rag_resume_parent_scope BEFORE INSERT ON project_rag_jobs
 WHEN NEW.restart_mode='resume' AND NOT EXISTS(
  SELECT 1 FROM project_rag_jobs p WHERE p.id=NEW.resume_from_job_id
   AND p.project_id=NEW.project_id AND p.workspace_id=NEW.workspace_id
   AND p.generation_id=NEW.generation_id AND p.status='failed'
 ) BEGIN SELECT RAISE(ABORT,'Resume requires a failed job in the same scope and generation'); END;
CREATE TRIGGER rag_resume_lineage_immutable BEFORE UPDATE OF restart_mode,resume_from_job_id,generation_id,project_id,workspace_id ON project_rag_jobs
 WHEN NEW.restart_mode IS NOT OLD.restart_mode OR NEW.resume_from_job_id IS NOT OLD.resume_from_job_id
  OR NEW.generation_id IS NOT OLD.generation_id OR NEW.project_id IS NOT OLD.project_id OR NEW.workspace_id IS NOT OLD.workspace_id
 BEGIN SELECT RAISE(ABORT,'RAG job lineage is immutable'); END;
