-- Migration 0028: Decouple The Email Address From The User Identifier
--
-- `users.email` is the PRIMARY KEY and the identity key of every user-keyed
-- table, so changing an address is not merely unsupported, it is unsafe:
-- `connected_applications`, `application_context_documents` and
-- `application_context_deletion_runs` each carry
-- `FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE`, so
-- rewriting an address either trips the constraint or cascades the user's
-- mailboxes, context documents, and deletion history out of the database.
--
-- ## Why the anchor stays frozen
--
-- The plan was to rebuild those three tables to point at a new `users.id`. That
-- is not possible on D1:
--
--   * D1 honours neither `PRAGMA foreign_keys = off` (a deliberately dangling FK
--     insert is still rejected) nor `PRAGMA legacy_alter_table = on` (children
--     are still repointed on rename).
--   * `PRAGMA defer_foreign_keys = on` is honoured, but per D1's own docs it does
--     not suppress `ON DELETE CASCADE`.
--   * SQLite rewrites a child's FK clause when the parent is renamed, and drops
--     a parent by cascading -- so a referenced table can be dropped without
--     cascade only if nothing points at it, which is exactly what is changing.
--
-- So `users.email` becomes a frozen *anchor*: immutable, still the FK target,
-- and still what legacy `*_email` columns hold. Every new identity column is
-- additive and no existing value has to move.
--
-- ## Why the anchor is also the Vectorize namespace input
--
-- `EmailContextUtil.getUserVectorNamespace` derives the Vectorize namespace as
-- `u_` + sha256(email)[0:62], and that value is persisted in
-- `application_context_documents.vector_namespace` as well as stamped into
-- every vector's `namespace` field. Re-keying the namespace on the new id would
-- orphan every existing vector, so RAG and chat would silently return nothing
-- for every existing user. The anchor is what keeps it stable, which is a
-- second, independent reason it must never be updated.
--
-- ## Deploy order
--
-- Apply this migration BEFORE deploying the code that reads the new columns.
-- Reads that select `user_id` fail with `no such column` on an un-migrated
-- database. Rollback is a code rollback: this migration only adds columns and a
-- table, and the pre-0028 code ignores all of them.
--
-- Rerunnable: every backfill is guarded by `IS NULL` / `INSERT OR IGNORE`, and
-- `users.id` is only filled where it is still missing. The `ADD COLUMN`
-- statements are not guarded -- SQLite has no `IF NOT EXISTS` form for them.

-- ============================================================
-- 1. Stable account key
-- ============================================================
-- SQLite cannot add a PRIMARY KEY column, so the id is a plain column with a
-- unique index. A unique index is a valid foreign key parent, which is all the
-- `user_id` references below need.
--
-- New accounts get their id from `UserDAO.newId()` (WebCrypto) at runtime; this
-- backfill only has to cover the rows that already exist.
ALTER TABLE users ADD COLUMN id TEXT;

UPDATE users SET id = 'usr_' || lower(hex(randomblob(16))) WHERE id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id ON users(id);

-- ============================================================
-- 2. Mutable sign-in address
-- ============================================================
-- `users.email` stays the frozen anchor. `current_email` is what the account
-- signs in with, and is the only address column that is ever updated.
ALTER TABLE users ADD COLUMN current_email TEXT;

UPDATE users SET current_email = lower(email) WHERE current_email IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_current_email ON users(current_email);

-- ============================================================
-- 3. Address registry
-- ============================================================
-- One row per known address. `is_verified = 1` may authenticate the account;
-- `0` means the account moved off this address and the row is retained only so
-- rows written before the change still resolve to it. A revoked row is
-- re-pointed (not deleted) when a later account legitimately claims the
-- address, so an address is never permanently reserved.
--
-- Keyed on the lowercased address, so a legacy mixed-case anchor still yields
-- exactly one login identity.
CREATE TABLE IF NOT EXISTS user_emails (
    email TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_emails_user_id ON user_emails(user_id);

INSERT OR IGNORE INTO user_emails (email, user_id, is_verified, created_at)
SELECT lower(email), id, 1, created_at FROM users;

-- ============================================================
-- 4. user_id on every user-keyed table
-- ============================================================
-- Additive and nullable: `NULL` means "unknown actor" and keeps resolving via
-- its legacy string column, so no row is orphaned by this migration. The
-- backfill resolves through `user_emails` rather than `users.email` so that a
-- row also resolves once its address is linked as an alias, and `lower()` on
-- both sides makes the join case-insensitive by construction.

-- connected_applications: the ownership key. Every `*ForUser` predicate now
-- matches on this with the frozen `user_email` as the pre-0028 fallback.
ALTER TABLE connected_applications ADD COLUMN user_id TEXT REFERENCES users(id);

UPDATE connected_applications SET user_id = (
    SELECT ue.user_id FROM user_emails ue WHERE ue.email = lower(connected_applications.user_email) LIMIT 1
) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_connected_applications_user_id ON connected_applications(user_id);

-- application_context_documents: carries `vector_namespace`, which is frozen on
-- the anchor for the reason documented in the header.
ALTER TABLE application_context_documents ADD COLUMN user_id TEXT REFERENCES users(id);

UPDATE application_context_documents SET user_id = (
    SELECT ue.user_id FROM user_emails ue WHERE ue.email = lower(application_context_documents.user_email) LIMIT 1
) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_application_context_documents_user_id ON application_context_documents(user_id);

-- application_context_deletion_runs: retention history for pruned documents.
ALTER TABLE application_context_deletion_runs ADD COLUMN user_id TEXT REFERENCES users(id);

UPDATE application_context_deletion_runs SET user_id = (
    SELECT ue.user_id FROM user_emails ue WHERE ue.email = lower(application_context_deletion_runs.user_email) LIMIT 1
) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_application_context_deletion_runs_user_id ON application_context_deletion_runs(user_id);

-- email_summary_actions: proposed actions, attributable to an account.
ALTER TABLE email_summary_actions ADD COLUMN user_id TEXT REFERENCES users(id);

UPDATE email_summary_actions SET user_id = (
    SELECT ue.user_id FROM user_emails ue WHERE ue.email = lower(email_summary_actions.user_email) LIMIT 1
) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_summary_actions_user_id ON email_summary_actions(user_id);

-- context_audit_logs: append-only audit trail. The string column is kept
-- verbatim so history reads the same after an address change.
ALTER TABLE context_audit_logs ADD COLUMN user_id TEXT REFERENCES users(id);

UPDATE context_audit_logs SET user_id = (
    SELECT ue.user_id FROM user_emails ue WHERE ue.email = lower(context_audit_logs.user_email) LIMIT 1
) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_context_audit_logs_user_id ON context_audit_logs(user_id);

-- ============================================================
-- 5. Verify
-- ============================================================
-- `PRAGMA foreign_key_check` reports violations as rows rather than raising, so
-- it is a no-op here and is asserted empty by
-- `test/integration/api/UserIdentityUpgrade.int.test.ts` against a seeded
-- pre-0028 database.
PRAGMA foreign_key_check;
