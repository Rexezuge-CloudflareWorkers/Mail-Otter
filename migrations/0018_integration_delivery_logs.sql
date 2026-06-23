ALTER TABLE application_integrations ADD COLUMN last_delivery_at     INTEGER;
ALTER TABLE application_integrations ADD COLUMN last_delivery_status TEXT;
ALTER TABLE application_integrations ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;

CREATE TABLE integration_delivery_logs (
  log_id         TEXT    NOT NULL PRIMARY KEY,
  integration_id TEXT    NOT NULL,
  application_id TEXT    NOT NULL,
  status         TEXT    NOT NULL CHECK (status IN ('success', 'failure')),
  http_status    INTEGER,
  error_message  TEXT,
  email_subject  TEXT,
  created_at     INTEGER NOT NULL,
  FOREIGN KEY (integration_id)
    REFERENCES application_integrations(integration_id) ON DELETE CASCADE
);

CREATE INDEX idx_idl_integration_created ON integration_delivery_logs(integration_id, created_at DESC);
CREATE INDEX idx_idl_created_at ON integration_delivery_logs(created_at);
