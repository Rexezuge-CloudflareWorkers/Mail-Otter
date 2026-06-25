import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF, adminSecretsStore } from 'cloudflare:test';
import type { SecretsStoreSecret } from 'cloudflare:workers';
import { applyMigrations } from '../helpers/migrations';

let appCounter = 0;

async function seedApplication(): Promise<string> {
  appCounter++;
  const applicationId = `action-app-${appCounter}-${Date.now()}`;
  const email = `action-user-${appCounter}@example.com`;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO users (email, created_at, updated_at) VALUES (?, ?, ?)`,
  ).bind(email, now, now).run();
  await env.DB.prepare(
    `INSERT INTO connected_applications (application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at) ` +
    `VALUES (?, ?, ?, 'google-gmail', 'oauth2', 'enc', 'iv', 'connected', ?, ?)`,
  ).bind(applicationId, email, 'Gmail', now, now).run();
  return applicationId;
}

describe('Action confirmation endpoint', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
    for (const binding of ['ACTION_SIGNING_SECRET', 'ACTION_ENCRYPTION_KEY_SECRET', 'AES_ENCRYPTION_KEY_SECRET'] as const) {
      const secret = (env as Record<string, unknown>)[binding] as SecretsStoreSecret | undefined;
      if (secret) {
        const admin = adminSecretsStore(secret);
        await admin.create(`test-${binding}-value`);
      }
    }
  });

  it('returns 404 for a path without actionId', async () => {
    const response: Response = await SELF.fetch('http://localhost/api/actions/', { method: 'GET' });

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-existent action id', async () => {
    const response: Response = await SELF.fetch(
      'http://localhost/api/actions/non-existent-action',
      { method: 'GET' },
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 for an existing action with a non-matching token', async () => {
    const applicationId = await seedApplication();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO processed_messages (processed_message_id, application_id, provider_id, provider_message_id, status, created_at, updated_at) ` +
      `VALUES (?, ?, 'google-gmail', 'msg-action', 'summarized', ?, ?)`,
    ).bind(`pm-${applicationId}`, applicationId, now, now).run();
    await env.DB.prepare(
      `INSERT INTO email_summary_actions (action_id, processed_message_id, application_id, user_email, provider_id, provider_message_id, action_type, status, risk_level, token_hash, encrypted_payload, payload_iv, payload_salt, expires_at, created_at, updated_at) ` +
      `VALUES (?, ?, ?, ?, 'google-gmail', 'msg-action', 'email.draft_reply', 'pending', 'low', 'known-hash', 'encrypted', 'iv', 'salt', ?, ?, ?)`,
    ).bind(`action-${applicationId}`, `pm-${applicationId}`, applicationId, `action-user-${appCounter}@example.com`, now + 86_400, now, now).run();

    const response: Response = await SELF.fetch(
      `http://localhost/api/actions/action-${applicationId}?token=wrong-token`,
      { method: 'GET' },
    );

    expect(response.status).toBe(404);
  });
});
