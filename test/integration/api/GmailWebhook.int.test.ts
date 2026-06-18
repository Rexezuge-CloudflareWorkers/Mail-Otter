import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { CryptoUtil } from '@mail-otter/shared/utils';
import { applyMigrations } from '../helpers/migrations';

let appCounter = 0;

const VALID_TOKEN = 'valid-test-token';

async function seedApplication(): Promise<string> {
  appCounter++;
  const applicationId = `gmail-app-${appCounter}-${Date.now()}`;
  const email = `gmail-user-${appCounter}@example.com`;
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

describe('Gmail webhook endpoint', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('rejects a request missing the required token query parameter', async () => {
    const response: Response = await SELF.fetch('http://localhost/api/webhooks/gmail/app-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          data: 'not-valid-base64',
          messageId: 'msg-1',
        },
      }),
    });

    expect(response.status).toBe(400);
  });

  it('returns 401 for a missing subscription', async () => {
    const data: string = btoa(JSON.stringify({ historyId: '12345' }));
    const response: Response = await SELF.fetch('http://localhost/api/webhooks/gmail/non-existent-app?token=some-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: { data, messageId: 'msg-1' },
      }),
    });

    expect(response.status).toBe(401);
  });

  it('returns 401 when the token does not match the stored webhook secret', async () => {
    const appId = await seedApplication();
    const now = Math.floor(Date.now() / 1000);
    const tokenHash: string = await CryptoUtil.sha256Hex(VALID_TOKEN);
    await env.DB.prepare(
      `INSERT INTO provider_subscriptions (subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, client_state_hash, status, created_at, updated_at) ` +
      `VALUES (?, ?, 'google-gmail', 'ext-sub-1', ?, NULL, 'active', ?, ?)`,
    ).bind(`sub-${appId}`, appId, tokenHash, now, now).run();

    const data: string = btoa(JSON.stringify({ historyId: '12345' }));
    const response: Response = await SELF.fetch(`http://localhost/api/webhooks/gmail/${appId}?token=wrong-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: { data, messageId: 'msg-1' },
      }),
    });

    expect(response.status).toBe(401);
  });

  it('accepts a valid Gmail webhook notification and enqueues an event', async () => {
    const appId = await seedApplication();
    const now = Math.floor(Date.now() / 1000);
    const tokenHash: string = await CryptoUtil.sha256Hex(VALID_TOKEN);
    await env.DB.prepare(
      `INSERT INTO provider_subscriptions (subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, status, created_at, updated_at) ` +
      `VALUES (?, ?, 'google-gmail', 'ext-sub-valid', ?, 'active', ?, ?)`,
    ).bind(`sub-${appId}`, appId, tokenHash, now, now).run();

    const data: string = btoa(JSON.stringify({ historyId: '12345' }));
    const response: Response = await SELF.fetch(`http://localhost/api/webhooks/gmail/${appId}?token=${VALID_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: { data, messageId: 'msg-1' },
      }),
    });

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toEqual({ message: 'accepted' });
  });
});
