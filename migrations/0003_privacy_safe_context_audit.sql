ALTER TABLE application_context_documents
ADD COLUMN source_document_fingerprint TEXT;

ALTER TABLE application_context_documents
ADD COLUMN source_thread_fingerprint TEXT;

ALTER TABLE application_context_documents
ADD COLUMN title_fingerprint TEXT;

ALTER TABLE application_context_documents
ADD COLUMN sender_fingerprint TEXT;

ALTER TABLE application_context_documents
ADD COLUMN content_fingerprint TEXT;

ALTER TABLE application_context_documents
ADD COLUMN indexed_text_chars INTEGER NOT NULL DEFAULT 0;

UPDATE application_context_documents
SET title = NULL,
    sender = NULL,
    indexed_text = NULL;

UPDATE processed_messages
SET subject = NULL;
