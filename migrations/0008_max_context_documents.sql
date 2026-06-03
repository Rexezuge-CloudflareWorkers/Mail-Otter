ALTER TABLE connected_applications
  ADD COLUMN max_context_documents INTEGER;

CREATE INDEX idx_application_context_documents_application_created
  ON application_context_documents(application_id, created_at)
  WHERE status = 'active';
