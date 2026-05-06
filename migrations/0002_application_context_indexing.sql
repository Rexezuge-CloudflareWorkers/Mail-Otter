ALTER TABLE connected_applications
ADD COLUMN context_indexing_enabled INTEGER NOT NULL DEFAULT 1;

CREATE TABLE application_context_documents (
    context_document_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_provider_id TEXT NOT NULL,
    source_document_id TEXT NOT NULL,
    source_thread_id TEXT,
    vector_namespace TEXT NOT NULL,
    vector_id TEXT NOT NULL UNIQUE,
    title TEXT,
    sender TEXT,
    indexed_text TEXT,
    status TEXT NOT NULL,
    indexed_at INTEGER,
    deleted_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
    UNIQUE (application_id, source_type, source_document_id),
    CHECK (source_provider_id IN ('google-gmail', 'microsoft-outlook')),
    CHECK (status IN ('active', 'deleted', 'error'))
);

CREATE TABLE application_context_deletion_runs (
    deletion_run_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    vector_namespace TEXT NOT NULL,
    requested_vector_count INTEGER NOT NULL,
    deleted_vector_count INTEGER NOT NULL,
    mutation_ids TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
    CHECK (status IN ('accepted', 'error'))
);

CREATE INDEX idx_application_context_documents_application_id ON application_context_documents(application_id);
CREATE INDEX idx_application_context_documents_user_email ON application_context_documents(user_email);
CREATE INDEX idx_application_context_documents_status ON application_context_documents(status);
CREATE INDEX idx_application_context_documents_vector_id ON application_context_documents(vector_id);
CREATE INDEX idx_application_context_deletion_runs_application_id ON application_context_deletion_runs(application_id);
CREATE INDEX idx_application_context_deletion_runs_user_email ON application_context_deletion_runs(user_email);
