import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, migrationFileNames } from '../helpers/migrations';

/**
 * The load-bearing test for migration 0028.
 *
 * It proves the identity migration upgrades a *populated* pre-0028 database
 * without losing a single row. `users.email` is the PRIMARY KEY of `users` and
 * three tables cascade out of it, so a migration that rebuilt those tables — or
 * that rewrote the anchor — would silently delete a user's mailboxes, context
 * documents and deletion history. Every table holding a seeded row and every
 * table a cascade could reach is counted before the migration and recounted
 * after.
 *
 * It also pins the two properties that make the change safe to rely on: the
 * pre-existing foreign keys survive untouched (they are why the anchor had to be
 * frozen), and ownership ends up keyed on the account id, so changing an address
 * moves nothing the account owns.
 */
const LAST_PRE_IDENTITY_MIGRATION = '0027_action_execution_scheduled_trigger.sql';
const IDENTITY_MIGRATION = '0028_user_identity.sql';

const ALICE = 'alice@legacy.test';
const BOB = 'bob@legacy.test';
/**
 * Stored mixed-case on purpose. `users.email` is the PRIMARY KEY of a
 * case-sensitive TEXT column and the three tables that reference it carry a
 * case-sensitive foreign key, so a mixed-case anchor is only reachable on
 * `users` itself and on the tables with no user foreign key — which is exactly
 * what forces the backfills to join case-insensitively.
 */
const MIXED = 'Carol@Legacy.Test';
const ALICE_APP = 'app-alice';
const BOB_APP = 'app-bob';
const NOW = 1_700_000_000;

/**
Every table that holds a seeded row, plus everything a cascade could reach.
*/
const GUARDED_TABLES: string[] = [
  'users',
  'connected_applications',
  'provider_subscriptions',
  'processed_messages',
  'oauth2_authorization_sessions',
  'oauth2_access_token_refresh_status',
  'application_watched_folders',
  'provider_application_configs',
  'application_context_documents',
  'context_audit_logs',
  'application_context_deletion_runs',
  'application_integrations',
  'integration_delivery_logs',
  'email_summary_actions',
  'email_action_executions',
  'synced_calendar_events',
  'background_task_runs',
];

/**
 * Absolute counts, mirroring the seed below. Asserting only "before equals after"
 * would pass on a migration that dropped a table and its rows together, which is
 * precisely the failure mode being guarded against.
 */
const SEEDED_COUNTS: Record<string, number> = {
  users: 3,
  connected_applications: 2,
  provider_subscriptions: 1,
  processed_messages: 1,
  oauth2_authorization_sessions: 1,
  oauth2_access_token_refresh_status: 1,
  application_watched_folders: 1,
  provider_application_configs: 1,
  application_context_documents: 2,
  context_audit_logs: 2,
  application_context_deletion_runs: 1,
  application_integrations: 1,
  integration_delivery_logs: 1,
  email_summary_actions: 1,
  email_action_executions: 1,
  synced_calendar_events: 1,
  background_task_runs: 1,
};

let db: D1Database;
let before: Record<string, number>;
let after: Record<string, number>;

async function snapshotCounts(database: D1Database): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of GUARDED_TABLES) {
    const row = await database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
    counts[table] = row?.n ?? 0;
  }
  return counts;
}

async function userIdByEmail(email: string): Promise<string | null> {
  const row = await db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').bind(email).first<{ id: string }>();
  return row?.id ?? null;
}

async function insertSql(sql: string, bindings: unknown[]): Promise<void> {
  await db
    .prepare(sql)
    .bind(...bindings)
    .run();
}

async function seedLegacyGraph(): Promise<void> {
  // Three accounts. `email` is the primary key; none of them has an id, a
  // current_email, or a registry row — that is the pre-0028 shape.
  await insertSql('INSERT INTO users (email, created_at, updated_at) VALUES (?, ?, ?)', [ALICE, NOW, NOW]);
  await insertSql('INSERT INTO users (email, created_at, updated_at) VALUES (?, ?, ?)', [BOB, NOW, NOW]);
  await insertSql('INSERT INTO users (email, created_at, updated_at) VALUES (?, ?, ?)', [MIXED, NOW, NOW]);
  await insertSql('UPDATE users SET preferred_language = ? WHERE email = ?', ['de', ALICE]);

  await insertSql(
    `INSERT INTO connected_applications
       (application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at)
     VALUES (?, ?, 'Alice Mail', 'google-gmail', 'oauth2', 'enc', 'iv', 'connected', ?, ?)`,
    [ALICE_APP, ALICE, NOW, NOW],
  );
  await insertSql(
    `INSERT INTO connected_applications
       (application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at)
     VALUES (?, ?, 'Bob Mail', 'fastmail-jmap', 'imap-password', 'enc', 'iv', 'connected', ?, ?)`,
    [BOB_APP, BOB, NOW, NOW],
  );

  // One row in every table that cascades out of `connected_applications`, so a
  // migration that dropped or rebuilt the parent would take all of these with it.
  await insertSql(
    `INSERT INTO provider_subscriptions (subscription_id, application_id, provider_id, status, created_at, updated_at)
     VALUES ('sub-1', ?, 'google-gmail', 'active', ?, ?)`,
    [ALICE_APP, NOW, NOW],
  );
  await insertSql(
    `INSERT INTO processed_messages
       (processed_message_id, application_id, provider_id, provider_message_id, status, created_at, updated_at)
     VALUES ('pm-1', ?, 'google-gmail', 'gmail-msg-1', 'summarized', ?, ?)`,
    [ALICE_APP, NOW, NOW],
  );
  await insertSql(
    `INSERT INTO oauth2_authorization_sessions
       (session_id, application_id, state_hash, code_verifier, redirect_uri, created_at, expires_at)
     VALUES ('sess-1', ?, 'state-hash', 'verifier', 'https://app.test/cb', ?, ?)`,
    [ALICE_APP, NOW, NOW + 600],
  );
  await insertSql(
    `INSERT INTO oauth2_access_token_refresh_status (application_id, access_token_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    [ALICE_APP, NOW + 3600, NOW, NOW],
  );
  await insertSql(
    `INSERT INTO application_watched_folders (application_id, folder_path, folder_name, created_at) VALUES (?, 'INBOX', 'Inbox', ?)`,
    [ALICE_APP, NOW],
  );
  await insertSql(
    `INSERT INTO provider_application_configs (application_id, config_key, config_value, created_at, updated_at)
     VALUES (?, 'content_language', 'en', ?, ?)`,
    [ALICE_APP, NOW, NOW],
  );

  // Context documents carry the Vectorize namespace, which is derived from the
  // anchor. Two rows, one owned by the mixed-case user, so the case-insensitive
  // backfill has something to resolve that is not a plain lowercase address.
  await insertSql(
    `INSERT INTO application_context_documents
       (context_document_id, application_id, user_email, source_type, source_provider_id, source_document_id,
        vector_namespace, vector_id, status, created_at, updated_at)
     VALUES ('doc-1', ?, ?, 'email', 'google-gmail', 'src-1', 'u_alice', 'vec-1', 'active', ?, ?)`,
    [ALICE_APP, ALICE, NOW, NOW],
  );
  await insertSql(
    `INSERT INTO application_context_documents
       (context_document_id, application_id, user_email, source_type, source_provider_id, source_document_id,
        vector_namespace, vector_id, status, created_at, updated_at)
     VALUES ('doc-2', ?, ?, 'email', 'fastmail-jmap', 'src-2', 'u_mixed', 'vec-2', 'active', ?, ?)`,
    [BOB_APP, MIXED, NOW, NOW],
  );
  await insertSql(
    `INSERT INTO context_audit_logs
       (id, context_document_id, application_id, user_email, event_type, event_label, severity, created_at)
     VALUES ('audit-1', 'doc-1', ?, ?, 'context_indexed', 'Indexed', 'info', ?)`,
    [ALICE_APP, ALICE, NOW],
  );
  await insertSql(
    `INSERT INTO context_audit_logs
       (id, context_document_id, application_id, user_email, event_type, event_label, severity, created_at)
     VALUES ('audit-2', 'doc-2', ?, ?, 'context_indexed', 'Indexed', 'info', ?)`,
    [BOB_APP, MIXED, NOW],
  );
  await insertSql(
    `INSERT INTO application_context_deletion_runs
       (deletion_run_id, application_id, user_email, vector_namespace, requested_vector_count, deleted_vector_count,
        mutation_ids, status, created_at, updated_at)
     VALUES ('run-1', ?, ?, 'u_alice', 1, 1, '[]', 'accepted', ?, ?)`,
    [ALICE_APP, ALICE, NOW, NOW],
  );

  await insertSql(
    `INSERT INTO application_integrations
       (integration_id, application_id, integration_type, name, encrypted_webhook_url, webhook_url_iv, created_at, updated_at)
     VALUES ('int-1', ?, 'webhook', 'Ops', 'enc', 'iv', ?, ?)`,
    [ALICE_APP, NOW, NOW],
  );
  await insertSql(
    `INSERT INTO integration_delivery_logs
       (log_id, integration_id, application_id, status, created_at)
     VALUES ('dlv-1', 'int-1', ?, 'success', ?)`,
    [ALICE_APP, NOW],
  );

  await insertSql(
    `INSERT INTO email_summary_actions
       (action_id, processed_message_id, application_id, user_email, provider_id, provider_message_id,
        action_type, status, risk_level, token_hash, encrypted_payload, payload_iv, payload_salt, expires_at, created_at, updated_at)
     VALUES ('act-1', 'pm-1', ?, ?, 'google-gmail', 'gmail-msg-1', 'calendar.add_event', 'pending', 'low', 'th-1', 'enc', 'iv', 'salt', ?, ?, ?)`,
    [ALICE_APP, ALICE, NOW + 86_400, NOW, NOW],
  );
  await insertSql(
    `INSERT INTO email_action_executions
       (execution_id, action_id, attempt, triggered_by, status, created_at)
     VALUES ('exec-1', 'act-1', 1, 'web_ui', 'succeeded', ?)`,
    [NOW],
  );

  await insertSql(
    `INSERT INTO synced_calendar_events
       (sync_event_id, application_id, provider_event_id, event_title, start_time, end_time, time_zone, synced_at)
     VALUES ('cal-1', ?, 'gcal-1', 'Standup', ?, ?, 'UTC', ?)`,
    [ALICE_APP, NOW, NOW + 1800, NOW],
  );
  await insertSql(
    `INSERT INTO background_task_runs (run_id, task_type, application_id, status, started_at, created_at)
     VALUES ('btr-1', 'calendar_sync', ?, 'success', ?, ?)`,
    [ALICE_APP, NOW, NOW],
  );
}

/**
 * The three statements `scripts/change-email.ts` and
 * `UserIdentityService.setPrimaryEmail` apply, in the same order. Claim first, then
 * move, then revoke: claiming first means there is only a brief window where both
 * addresses authenticate, whereas revoking first opens a window where neither does.
 */
async function applyAddressChange(userId: string, fromEmail: string, toEmail: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await insertSql(
    `INSERT INTO user_emails (email, user_id, is_verified, created_at) VALUES (?, ?, 1, ?)
     ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id, is_verified = excluded.is_verified`,
    [toEmail, userId, now],
  );
  await insertSql('UPDATE users SET current_email = ?, updated_at = ? WHERE id = ?', [toEmail, now, userId]);
  await insertSql('UPDATE user_emails SET is_verified = 0 WHERE user_id = ? AND email != ?', [userId, toEmail]);
  void fromEmail;
}

beforeAll(async () => {
  db = env.DB;
  // Guard the premise: if either file is renamed, this test would silently stop
  // testing the upgrade and start testing a no-op.
  expect(migrationFileNames()).toContain(LAST_PRE_IDENTITY_MIGRATION);
  expect(migrationFileNames()).toContain(IDENTITY_MIGRATION);

  await applyMigrations(db, { to: LAST_PRE_IDENTITY_MIGRATION });
  await seedLegacyGraph();
  before = await snapshotCounts(db);

  // Confirm we are really standing on the pre-0028 shape before "upgrading".
  const preUser = await db.prepare('SELECT * FROM users WHERE email = ?').bind(ALICE).first<Record<string, unknown>>();
  expect(preUser?.id).toBeUndefined();
  expect(preUser?.current_email).toBeUndefined();

  await applyMigrations(db, { from: IDENTITY_MIGRATION });
  after = await snapshotCounts(db);
});

describe('migration 0028 user identity upgrade', () => {
  it('loses no rows in any table reachable from users or connected_applications', () => {
    const diffs: string[] = [];
    for (const table of GUARDED_TABLES) {
      if (before[table] !== after[table]) diffs.push(`${table}: ${before[table]} -> ${after[table]}`);
      if (after[table] !== SEEDED_COUNTS[table]) diffs.push(`${table}: expected ${SEEDED_COUNTS[table]}, found ${after[table]}`);
    }
    expect(diffs).toEqual([]);
  });

  it('reports no foreign key violations after the migration', async () => {
    const violations = await db.prepare('PRAGMA foreign_key_check').all();
    expect(violations.results ?? []).toEqual([]);
  });

  it('leaves every pre-existing foreign key intact', async () => {
    // This is the constraint that forced the frozen-anchor design. If 0028 had
    // rebuilt any of these tables to point at `users(id)`, the cascade that
    // deleting a user triggers would have changed shape — and rows would have been
    // lost above.
    for (const table of ['connected_applications', 'application_context_documents', 'application_context_deletion_runs']) {
      const fks = await db.prepare(`PRAGMA foreign_key_list(${table})`).all<{ table: string; from: string }>();
      const toUsers = (fks.results ?? []).filter((fk) => fk.table === 'users').map((fk) => fk.from);
      // The anchor FK survives, and the new id FK was added alongside it.
      expect(toUsers).toEqual(['user_email', 'user_id']);
    }
    const usersSql = await db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").first<{ sql: string }>();
    expect(usersSql?.sql).toContain('email TEXT PRIMARY KEY');
    expect(usersSql?.sql).toContain('id TEXT');
    expect(usersSql?.sql).toContain('current_email TEXT');
  });

  it('gives every account a stable id and a verified registry row', async () => {
    const users = await db
      .prepare('SELECT email, id, current_email FROM users')
      .all<{ email: string; id: string; current_email: string }>();
    const rows = users.results ?? [];
    expect(rows).toHaveLength(3);
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(3);
    for (const row of rows) {
      expect(row.id).toMatch(/^usr_[0-9a-f]{32}$/);
      expect(row.current_email).toBe(row.email.toLowerCase());
    }

    const registry = await db.prepare('SELECT email, user_id, is_verified FROM user_emails').all<{
      email: string;
      user_id: string;
      is_verified: number;
    }>();
    const registryRows = registry.results ?? [];
    expect(registryRows).toHaveLength(3);
    for (const row of registryRows) {
      // Keyed on the lowercased address, so the mixed-case anchor still yields
      // exactly one login identity.
      expect(row.email).toBe(row.email.toLowerCase());
      expect(row.is_verified).toBe(1);
      expect(ids).toContain(row.user_id);
    }
  });

  it('backfills user_id on the user-keyed tables, case-insensitively', async () => {
    const alice = await userIdByEmail(ALICE);
    const mixed = await userIdByEmail(MIXED);
    expect(alice).toBeTruthy();
    expect(mixed).toBeTruthy();

    const applications = await db
      .prepare('SELECT application_id, user_email, user_id FROM connected_applications ORDER BY application_id')
      .all<{ application_id: string; user_email: string; user_id: string }>();
    const byId = new Map((applications.results ?? []).map((row) => [row.application_id, row]));
    expect(byId.get(ALICE_APP)?.user_id).toBe(alice);
    expect(byId.get(BOB_APP)?.user_id).toBe(await userIdByEmail(BOB));
    // The frozen anchor is retained verbatim, not rewritten to the lowercased form.
    expect(byId.get(ALICE_APP)?.user_email).toBe(ALICE);

    // The case-insensitive proof: `Carol@Legacy.Test` only resolves through a
    // lower()-on-both-sides join.
    const mixedDoc = await db
      .prepare('SELECT user_email, user_id FROM application_context_documents WHERE context_document_id = ?')
      .bind('doc-2')
      .first<{
        user_email: string;
        user_id: string;
      }>();
    expect(mixedDoc?.user_id).toBe(mixed);

    const mixedAudit = await db.prepare('SELECT user_id FROM context_audit_logs WHERE id = ?').bind('audit-2').first<{ user_id: string }>();
    expect(mixedAudit?.user_id).toBe(mixed);

    const mixedRun = await db
      .prepare('SELECT user_id FROM application_context_deletion_runs WHERE deletion_run_id = ?')
      .bind('run-1')
      .first<{ user_id: string }>();
    expect(mixedRun?.user_id).toBe(alice);

    const action = await db.prepare('SELECT user_email, user_id FROM email_summary_actions WHERE action_id = ?').bind('act-1').first<{
      user_email: string;
      user_id: string;
    }>();
    expect(action?.user_id).toBe(alice);
    expect(action?.user_email).toBe(ALICE);
  });

  it('preserves the preferred_language column the migration does not touch', async () => {
    const row = await db.prepare('SELECT preferred_language FROM users WHERE lower(email) = lower(?)').bind(ALICE).first<{
      preferred_language: string | null;
    }>();
    expect(row?.preferred_language).toBe('de');
  });

  it('keeps id-keyed ownership across an address change', async () => {
    const alice = (await userIdByEmail(ALICE)) as string;
    const newAddress = 'alice.new@legacy.test';

    await applyAddressChange(alice, ALICE, newAddress);

    const row = await db.prepare('SELECT email, current_email FROM users WHERE id = ?').bind(alice).first<{
      email: string;
      current_email: string;
    }>();
    expect(row?.current_email).toBe(newAddress);
    // The anchor never moves: rewriting it is what would cascade the account's
    // rows away and orphan its Vectorize namespace.
    expect(row?.email).toBe(ALICE);

    const addresses = await db
      .prepare('SELECT email, is_verified FROM user_emails WHERE user_id = ? ORDER BY email')
      .bind(alice)
      .all<{ email: string; is_verified: number }>();
    const rows = addresses.results ?? [];
    expect(rows).toHaveLength(2);
    // Revoked, not deleted, so rows written before the change still resolve.
    const old = rows.find((r) => r.email === ALICE);
    const current = rows.find((r) => r.email === newAddress);
    expect(old?.is_verified).toBe(0);
    expect(current?.is_verified).toBe(1);

    // Everything the account owns is still keyed to the same id.
    const owned = await db
      .prepare('SELECT application_id, user_id FROM connected_applications WHERE application_id = ?')
      .bind(ALICE_APP)
      .first<{ application_id: string; user_id: string }>();
    expect(owned?.user_id).toBe(alice);
    const docs = await db
      .prepare('SELECT COUNT(*) AS n FROM application_context_documents WHERE user_id = ?')
      .bind(alice)
      .first<{ n: number }>();
    expect(docs?.n).toBe(1);
  });

  it('does not hand a released address to its successor', async () => {
    // A revoked address is released for re-registration: the registry row is
    // re-pointed, but the previous holder's anchor — the primary key every legacy
    // foreign key resolves against — is permanently taken, so the successor must
    // take an opaque anchor of its own and inherit nothing.
    const alice = (await userIdByEmail(ALICE)) as string;
    const successorId = `usr_${'0'.repeat(32)}`;
    const successorAnchor = `anchor-${'0'.repeat(32)}@users.invalid`;

    await insertSql('INSERT INTO users (id, email, current_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
      successorId,
      successorAnchor,
      ALICE,
      NOW,
      NOW,
    ]);
    // `register` re-points a revoked row and refuses a verified one.
    await insertSql(
      `INSERT INTO user_emails (email, user_id, is_verified, created_at) VALUES (?, ?, 1, ?)
       ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id, is_verified = excluded.is_verified`,
      [ALICE, successorId, NOW],
    );

    const inherited = await db
      .prepare('SELECT COUNT(*) AS n FROM connected_applications WHERE user_id = ?')
      .bind(successorId)
      .first<{ n: number }>();
    expect(inherited?.n).toBe(0);

    const stillAlice = await db
      .prepare('SELECT user_id FROM connected_applications WHERE application_id = ?')
      .bind(ALICE_APP)
      .first<{ user_id: string }>();
    expect(stillAlice?.user_id).toBe(alice);
  });
});
