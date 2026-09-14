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

export async function ensureUser(db: D1Database, email: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(`INSERT OR IGNORE INTO users (email, created_at, updated_at) VALUES (?, ?, ?)`)
    .bind(email, now, now)
    .run();
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
  await db
    .prepare(
      `INSERT INTO connected_applications (application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at) ` +
        `VALUES (?, ?, ?, ?, 'oauth2', 'enc', 'iv', 'connected', ?, ?)`,
    )
    .bind(applicationId, userEmail, 'Seeded App', providerId, now, now)
    .run();
  return applicationId;
}

export { VALID_BASE64_KEY };
