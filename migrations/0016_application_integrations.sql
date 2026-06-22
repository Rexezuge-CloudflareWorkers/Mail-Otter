CREATE TABLE IF NOT EXISTS application_integrations (
  integration_id        TEXT    NOT NULL PRIMARY KEY,
  application_id        TEXT    NOT NULL,
  integration_type      TEXT    NOT NULL,
  name                  TEXT    NOT NULL,
  encrypted_webhook_url TEXT    NOT NULL,
  webhook_url_iv        TEXT    NOT NULL,
  webhook_url_prefix    TEXT    NOT NULL DEFAULT '',
  enabled               INTEGER NOT NULL DEFAULT 1,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  FOREIGN KEY (application_id)
    REFERENCES connected_applications(application_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_application_integrations_app_id
  ON application_integrations(application_id);
