ALTER TABLE application_context_documents
DROP COLUMN title;

ALTER TABLE application_context_documents
DROP COLUMN sender;

ALTER TABLE application_context_documents
DROP COLUMN indexed_text;

ALTER TABLE processed_messages
DROP COLUMN subject;
