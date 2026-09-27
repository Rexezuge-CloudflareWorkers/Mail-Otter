-- Widen the email_action_executions.triggered_by CHECK to accept 'scheduled'.
--
-- 0021_squash.sql created the column with
--   CHECK (triggered_by IN ('email_callback', 'web_ui', 'system_expiry', 'auto_execute'))
-- but 0025_action_scheduling.sql added the scheduling feature and its
-- EMAIL_ACTION_TRIGGER_SCHEDULED ('scheduled') trigger without updating the
-- constraint. Scheduled auto-execution therefore always failed at the
-- execution-record INSERT: the provider side effect had already succeeded
-- (e.g. a Google Calendar event was created), executeAction caught the CHECK
-- violation and called markFailed, and the user saw a `failed` action with no
-- audit row written.
--
-- SQLite (and therefore D1) has no ALTER TABLE ... DROP CONSTRAINT, so this is
-- a table rebuild. email_action_executions is a leaf table (no other table
-- references it) with a single index, so the rebuild is:
--   1. create the replacement table with the widened CHECK
--   2. copy every row across
--   3. drop the old table
--   4. rename the replacement into place
--   5. recreate the index
-- Ordering matters: every intermediate state is a valid schema, so the
-- migration also succeeds when statements are applied one at a time (which is
-- how the integration test harness applies migrations, and how D1 would behave
-- if a batch were interrupted).

CREATE TABLE IF NOT EXISTS email_action_executions_widened (
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
    CHECK (triggered_by IN ('email_callback', 'web_ui', 'system_expiry', 'auto_execute', 'scheduled')),
    CHECK (status IN ('pending', 'executing', 'succeeded', 'failed', 'expired', 'cancelled'))
);

INSERT INTO email_action_executions_widened (
    execution_id, action_id, attempt, triggered_by, status,
    provider_operation_id, request_user_agent_hash, error_message,
    created_at, completed_at
)
SELECT
    execution_id, action_id, attempt, triggered_by, status,
    provider_operation_id, request_user_agent_hash, error_message,
    created_at, completed_at
FROM email_action_executions;

DROP TABLE email_action_executions;

ALTER TABLE email_action_executions_widened RENAME TO email_action_executions;

CREATE INDEX IF NOT EXISTS idx_email_action_executions_action
    ON email_action_executions(action_id, created_at);
