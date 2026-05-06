CREATE TABLE users (
    email TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE connected_applications (
    application_id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    provider_email TEXT,
    display_name TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    connection_method TEXT NOT NULL,
    encrypted_credentials TEXT NOT NULL,
    credentials_iv TEXT NOT NULL,
    status TEXT NOT NULL,
    gmail_pubsub_topic_name TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
    CHECK (provider_id IN ('google-gmail', 'microsoft-outlook')),
    CHECK (connection_method IN ('oauth2')),
    CHECK (status IN ('draft', 'connected', 'error'))
);

CREATE TABLE provider_subscriptions (
    subscription_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL UNIQUE,
    provider_id TEXT NOT NULL,
    external_subscription_id TEXT UNIQUE,
    webhook_secret_hash TEXT,
    client_state_hash TEXT,
    gmail_history_id TEXT,
    resource TEXT,
    status TEXT NOT NULL,
    expires_at INTEGER,
    last_notification_at INTEGER,
    last_renewed_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    CHECK (provider_id IN ('google-gmail', 'microsoft-outlook')),
    CHECK (status IN ('active', 'stopped', 'error'))
);

CREATE TABLE processed_messages (
    processed_message_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    provider_message_id TEXT NOT NULL,
    provider_thread_id TEXT,
    subject TEXT,
    status TEXT NOT NULL,
    summary_sent_at INTEGER,
    error_message TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    UNIQUE (application_id, provider_message_id),
    CHECK (provider_id IN ('google-gmail', 'microsoft-outlook')),
    CHECK (status IN ('processing', 'summarized', 'skipped', 'error'))
);

CREATE TABLE oauth2_authorization_sessions (
    session_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    state_hash TEXT NOT NULL UNIQUE,
    code_verifier TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE
);

CREATE INDEX idx_connected_applications_user_email ON connected_applications(user_email);
CREATE INDEX idx_provider_subscriptions_application_id ON provider_subscriptions(application_id);
CREATE INDEX idx_provider_subscriptions_external_id ON provider_subscriptions(external_subscription_id);
CREATE INDEX idx_provider_subscriptions_expires_at ON provider_subscriptions(expires_at);
CREATE INDEX idx_processed_messages_application_id ON processed_messages(application_id);
CREATE INDEX idx_processed_messages_status ON processed_messages(status);
CREATE INDEX idx_oauth2_authorization_sessions_application_id ON oauth2_authorization_sessions(application_id);
CREATE INDEX idx_oauth2_authorization_sessions_expires_at ON oauth2_authorization_sessions(expires_at);
