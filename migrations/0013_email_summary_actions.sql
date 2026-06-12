CREATE TABLE email_summary_actions (
    action_id TEXT PRIMARY KEY,
    processed_message_id TEXT NOT NULL,
    application_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    provider_message_id TEXT NOT NULL,
    provider_thread_id TEXT,
    action_type TEXT NOT NULL,
    status TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    encrypted_payload TEXT NOT NULL,
    payload_iv TEXT NOT NULL,
    payload_salt TEXT NOT NULL,
    encrypted_result TEXT,
    result_iv TEXT,
    result_salt TEXT,
    error_message TEXT,
    expires_at INTEGER NOT NULL,
    executed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (processed_message_id) REFERENCES processed_messages(processed_message_id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    CHECK (provider_id IN ('google-gmail', 'microsoft-outlook')),
    CHECK (action_type IN ('calendar.add_event', 'email.draft_reply', 'external.open_link', 'manual.todo')),
    CHECK (status IN ('pending', 'executing', 'succeeded', 'failed', 'expired', 'cancelled')),
    CHECK (risk_level IN ('low', 'medium', 'high'))
);

CREATE TABLE email_action_executions (
    execution_id TEXT PRIMARY KEY,
    action_id TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    triggered_by TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_operation_id TEXT,
    request_user_agent_hash TEXT,
    error_message TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (action_id) REFERENCES email_summary_actions(action_id) ON DELETE CASCADE,
    CHECK (triggered_by IN ('email_callback', 'web_ui', 'system_expiry')),
    CHECK (status IN ('pending', 'executing', 'succeeded', 'failed', 'expired', 'cancelled'))
);

CREATE INDEX idx_email_summary_actions_user_sort
  ON email_summary_actions(user_email, updated_at, created_at);

CREATE INDEX idx_email_summary_actions_application_status
  ON email_summary_actions(application_id, status, updated_at);

CREATE INDEX idx_email_summary_actions_status_expires
  ON email_summary_actions(status, expires_at);

CREATE INDEX idx_email_summary_actions_processed_message
  ON email_summary_actions(processed_message_id);

CREATE INDEX idx_email_action_executions_action
  ON email_action_executions(action_id, created_at);
