-- Migration 0022: Scheduled Digest Mode
-- Adds synced calendar events table and action external status columns.

CREATE TABLE IF NOT EXISTS synced_calendar_events (
    sync_event_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    provider_event_id TEXT NOT NULL,
    event_title TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    time_zone TEXT NOT NULL,
    location TEXT,
    notes TEXT,
    synced_at INTEGER NOT NULL,
    UNIQUE (application_id, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_calendar_events_app_start
    ON synced_calendar_events (application_id, start_time);

ALTER TABLE email_summary_actions ADD COLUMN sync_status TEXT;
ALTER TABLE email_summary_actions ADD COLUMN sync_updated_at INTEGER;
