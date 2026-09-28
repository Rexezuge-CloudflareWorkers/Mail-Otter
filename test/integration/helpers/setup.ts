import { SELF, adminSecretsStore } from 'cloudflare:test';
import type { SecretsStoreSecret } from 'cloudflare:workers';
import { expect } from 'vitest';
import { applyMigrations } from './migrations';

/**
 * Shared setup for integration tests (real D1 via `SELF.fetch`).
 *
 * Centralizes the `beforeAll` boilerplate previously copied across
 * `test/integration/api/*.int.test.ts`: migrations, secrets-store keys,
 * user seeding, and application creation via the public API.
 */

const VALID_BASE64_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

type TestEnv = Record<string, unknown> & { DB: D1Database };

async function ensureSecret(env: TestEnv, binding: string, value: string = VALID_BASE64_KEY): Promise<void> {
  const secret = env[binding] as SecretsStoreSecret | undefined;
  if (secret) {
    await adminSecretsStore(secret).create(value);
  }
}

export async function ensureAesSecret(env: TestEnv): Promise<void> {
  await ensureSecret(env, 'AES_ENCRYPTION_KEY_SECRET');
}

export async function ensureActionSecrets(env: TestEnv): Promise<void> {
  for (const binding of ['ACTION_SIGNING_SECRET', 'ACTION_ENCRYPTION_KEY_SECRET', 'AES_ENCRYPTION_KEY_SECRET'] as const) {
    await ensureSecret(env, binding);
  }
}

/**
 * Seed a user in the post-0028 shape.
 *
 * After the identity migration an account is keyed on `id`, its sign-in address
 * lives in `current_email` plus the `user_emails` registry, and `email` stays the
 * frozen anchor so the pre-existing foreign keys keep resolving. Seeding only
 * `(email, created_at, updated_at)` would leave the row without an id, which is
 * exactly the shape the migration is supposed to have eliminated.
 *
 * `INSERT OR IGNORE` means an already-seeded user keeps its existing id, so the
 * read-back below is what callers should rely on. Returns the account id.
 */
export async function ensureUser(db: D1Database, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const normalized: string = email.trim().toLowerCase();
  const id: string = `usr_${crypto.randomUUID().replaceAll('-', '')}`;
  await db
    .prepare(`INSERT OR IGNORE INTO users (id, email, current_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, normalized, normalized, now, now)
    .run();
  const row = await db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').bind(normalized).first<{ id: string }>();
  const userId: string = row?.id ?? id;
  await db
    .prepare(
      `INSERT INTO user_emails (email, user_id, is_verified, created_at) VALUES (?, ?, 1, ?)
       ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id, is_verified = 1`,
    )
    .bind(normalized, userId, now)
    .run();
  return userId;
}

export async function setupIntegrationTest(env: TestEnv, userEmail?: string): Promise<void> {
  await applyMigrations(env.DB);
  await ensureAesSecret(env);
  if (userEmail) {
    await ensureUser(env.DB, userEmail);
  }
}

export async function setupActionIntegrationTest(env: TestEnv, userEmail?: string): Promise<void> {
  await applyMigrations(env.DB);
  await ensureActionSecrets(env);
  if (userEmail) {
    await ensureUser(env.DB, userEmail);
  }
}

export async function createApplicationViaApi(displayName = 'Integration Test App'): Promise<string> {
  const response: Response = await SELF.fetch('http://localhost/user/application', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName,
      providerId: 'google-gmail',
      connectionMethod: 'oauth2',
      clientId: 'integration-test-client-id',
      clientSecret: 'integration-test-client-secret',
      gmailPubsubTopicName: 'projects/my-project/topics/mail-otter',
    }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { application: { applicationId: string } };
  return body.application.applicationId;
}

export async function seedConnectedApp(db: D1Database, userEmail: string, providerId = 'google-gmail'): Promise<string> {
  const applicationId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  // `user_email` stays the frozen anchor; `user_id` is the ownership key the
  // migration backfills and that every `*ForUser` predicate now keys on.
  const owner = await db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').bind(userEmail).first<{ id: string }>();
  await db
    .prepare(
      `INSERT INTO connected_applications (application_id, user_email, user_id, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at) ` +
        `VALUES (?, ?, ?, ?, ?, 'oauth2', 'enc', 'iv', 'connected', ?, ?)`,
    )
    .bind(applicationId, userEmail, owner?.id ?? null, 'Seeded App', providerId, now, now)
    .run();
  return applicationId;
}

export { VALID_BASE64_KEY };
