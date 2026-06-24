ALTER TABLE connected_applications
  ADD COLUMN rag_retrieval_enabled INTEGER NOT NULL DEFAULT 1;
