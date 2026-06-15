CREATE TABLE IF NOT EXISTS context_audit_logs (
    id TEXT PRIMARY KEY,
    context_document_id TEXT NOT NULL,
    application_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    source_document_id TEXT,
    event_type TEXT NOT NULL,
    event_label TEXT,
    event_data TEXT,
    severity TEXT NOT NULL DEFAULT 'info',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (context_document_id) REFERENCES application_context_documents(context_document_id)
);

CREATE INDEX IF NOT EXISTS idx_cal_ctx_doc ON context_audit_logs(context_document_id, created_at);
