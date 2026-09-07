-- Per-user UI language preference (BCP 47, e.g. en, de, fr, ja, zh-CN).
-- NULL means English (default). Validated/normalized by LocaleUtil in application code.
ALTER TABLE users ADD COLUMN preferred_language TEXT;
