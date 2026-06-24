-- Migration 0023: Background Task Run Visibility
-- Adds a unified audit log for all background task executions.

CREATE TABLE IF NOT EXISTS background_task_runs (
    run_id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    application_id TEXT REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'running',
    items_processed INTEGER NOT NULL DEFAULT 0,
    items_failed INTEGER NOT NULL DEFAULT 0,
    summary TEXT,
    details TEXT,
    error_message TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    created_at INTEGER NOT NULL,
    CHECK (status IN ('running', 'success', 'partial_success', 'error', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_btr_app_started
    ON background_task_runs (application_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_btr_type_started
    ON background_task_runs (task_type, started_at DESC);

-- Indexes to support Processing view panels for messages and calendar events
CREATE INDEX IF NOT EXISTS idx_sce_app_synced_at
    ON synced_calendar_events (application_id, synced_at);

CREATE INDEX IF NOT EXISTS idx_pm_app_created
    ON processed_messages (application_id, created_at DESC);
