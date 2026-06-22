-- Migration 0017: Add support for new email providers (Fastmail/JMAP, Yahoo Mail, Custom IMAP, Apple iCloud)
-- Updates provider_id CHECK constraints in all three tables, adds imap-password connection method,
-- and adds imap_cursor column to provider_subscriptions for polling-based providers.

-- SQLite does not support ALTER COLUMN or DROP CONSTRAINT. We rebuild each affected table.

-- 1. connected_applications: add new provider IDs and imap-password connection method
-- Current column set (after migrations 0001–0015): application_id, user_email, provider_email,
-- display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status,
-- created_at, updated_at, context_indexing_enabled, max_context_documents,
-- last_error_acknowledged_at, context_last_error_acknowledged_at
-- (gmail_pubsub_topic_name and watched_folder_ids were dropped in 0011)
CREATE TABLE connected_applications_new (
    application_id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    provider_email TEXT,
    display_name TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    connection_method TEXT NOT NULL,
    encrypted_credentials TEXT NOT NULL,
    credentials_iv TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    context_indexing_enabled INTEGER NOT NULL DEFAULT 1,
    max_context_documents INTEGER,
    last_error_acknowledged_at INTEGER,
    context_last_error_acknowledged_at INTEGER,
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
    CHECK (provider_id IN ('google-gmail', 'microsoft-outlook', 'fastmail-jmap', 'yahoo-mail', 'custom-imap', 'apple-icloud')),
    CHECK (connection_method IN ('oauth2', 'imap-password')),
    CHECK (status IN ('draft', 'connected', 'error'))
);
INSERT INTO connected_applications_new
    SELECT application_id, user_email, provider_email, display_name, provider_id, connection_method,
           encrypted_credentials, credentials_iv, status, created_at, updated_at,
           context_indexing_enabled, max_context_documents, last_error_acknowledged_at,
           context_last_error_acknowledged_at
    FROM connected_applications;
DROP TABLE connected_applications;
ALTER TABLE connected_applications_new RENAME TO connected_applications;
CREATE INDEX idx_connected_applications_user_email ON connected_applications(user_email);

-- 2. provider_subscriptions: add new provider IDs and imap_cursor column
CREATE TABLE provider_subscriptions_new (
    subscription_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL UNIQUE,
    provider_id TEXT,
    external_subscription_id TEXT UNIQUE,
    webhook_secret_hash TEXT,
    client_state_hash TEXT,
    gmail_history_id TEXT,
    imap_cursor TEXT,
    resource TEXT,
    status TEXT NOT NULL,
    expires_at INTEGER,
    last_notification_at INTEGER,
    last_renewed_at INTEGER,
    last_error TEXT,
    renewal_retry_count INTEGER NOT NULL DEFAULT 0,
    renewal_next_retry_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    CHECK (provider_id IS NULL OR provider_id IN ('google-gmail', 'microsoft-outlook', 'fastmail-jmap', 'yahoo-mail', 'custom-imap', 'apple-icloud')),
    CHECK (status IN ('active', 'stopped', 'error'))
);
INSERT INTO provider_subscriptions_new
    SELECT subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash,
           client_state_hash, gmail_history_id, NULL AS imap_cursor, resource, status, expires_at,
           last_notification_at, last_renewed_at, last_error, renewal_retry_count, renewal_next_retry_at,
           created_at, updated_at
    FROM provider_subscriptions;
DROP TABLE provider_subscriptions;
ALTER TABLE provider_subscriptions_new RENAME TO provider_subscriptions;
CREATE INDEX idx_provider_subscriptions_application_id ON provider_subscriptions(application_id);
CREATE INDEX idx_provider_subscriptions_external_id ON provider_subscriptions(external_subscription_id);
CREATE INDEX idx_provider_subscriptions_expires_at ON provider_subscriptions(expires_at);
-- Recreate composite renewal index from 0011
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_renewal
  ON provider_subscriptions(status, expires_at, renewal_next_retry_at);

-- 3. processed_messages: add new provider IDs
-- Current column set (after migrations 0001, 0004, 0009): processed_message_id, application_id,
-- provider_id, provider_message_id, provider_thread_id, status, summary_sent_at, error_message,
-- created_at, updated_at, provider_stable_message_fingerprint
-- (subject was dropped in 0004 and provider_stable_message_fingerprint added in 0009)
CREATE TABLE processed_messages_new (
    processed_message_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    provider_message_id TEXT NOT NULL,
    provider_thread_id TEXT,
    status TEXT NOT NULL,
    summary_sent_at INTEGER,
    error_message TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    provider_stable_message_fingerprint TEXT,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    UNIQUE (application_id, provider_message_id),
    CHECK (provider_id IN ('google-gmail', 'microsoft-outlook', 'fastmail-jmap', 'yahoo-mail', 'custom-imap', 'apple-icloud')),
    CHECK (status IN ('processing', 'summarized', 'skipped', 'error'))
);
INSERT INTO processed_messages_new
    SELECT processed_message_id, application_id, provider_id, provider_message_id, provider_thread_id,
           status, summary_sent_at, error_message, created_at, updated_at,
           provider_stable_message_fingerprint
    FROM processed_messages;
DROP TABLE processed_messages;
ALTER TABLE processed_messages_new RENAME TO processed_messages;
CREATE INDEX idx_processed_messages_application_id ON processed_messages(application_id);
CREATE INDEX idx_processed_messages_status ON processed_messages(status);
-- Recreate partial unique index from 0009 (enforces stable fingerprint deduplication)
CREATE UNIQUE INDEX idx_processed_messages_stable_fingerprint
  ON processed_messages(application_id, provider_id, provider_stable_message_fingerprint)
  WHERE provider_stable_message_fingerprint IS NOT NULL;
-- Recreate composite index from 0011 (used by getLatestForApplication/getLatestErrorForApplication)
CREATE INDEX IF NOT EXISTS idx_processed_messages_app_status_updated
  ON processed_messages(application_id, status, updated_at);
