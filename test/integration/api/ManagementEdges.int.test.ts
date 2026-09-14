import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { CryptoUtil } from '@mail-otter/shared/utils';
import { setupActionIntegrationTest, createApplicationViaApi } from '../helpers/setup';

const TEST_EMAIL = 'test@example.com';
const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000';
const FASTMAIL_TOKEN = 'fastmail-shared-secret';

async function seedFastmailApp(token: string = FASTMAIL_TOKEN): Promise<string> {
  const applicationId = `fastmail-app-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`INSERT OR IGNORE INTO users (email, created_at, updated_at) VALUES (?, ?, ?)`)
    .bind(`fm-${applicationId}@example.com`, now, now)
    .run();
  const userEmail = `fm-${applicationId}@example.com`;
  await env.DB.prepare(
    `INSERT INTO connected_applications (application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at) ` +
      `VALUES (?, ?, ?, 'fastmail-jmap', 'oauth2', 'enc', 'iv', 'connected', ?, ?)`,
  )
    .bind(applicationId, userEmail, 'Fastmail', now, now)
    .run();
  const tokenHash: string = await CryptoUtil.sha256Hex(token);
  await env.DB.prepare(
    `INSERT INTO provider_subscriptions (subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, status, created_at, updated_at) ` +
      `VALUES (?, ?, 'fastmail-jmap', ?, ?, 'active', ?, ?)`,
  )
    .bind(`sub-${applicationId}`, applicationId, `ext-${applicationId}`, tokenHash, now, now)
    .run();
  return applicationId;
}

/**
 * Management + webhook edges on real D1: Fastmail happy-path enqueue,
 * Outlook lifecycle handshake over GET, digest-send ownership, error
 * dismissal, and watch-settings persistence.
 */
describe('Management edges API', () => {
  beforeAll(async () => {
    await setupActionIntegrationTest(env as unknown as Record<string, unknown> & { DB: D1Database }, TEST_EMAIL);
  });

  describe('POST /api/webhooks/fastmail/:applicationId', () => {
    it('accepts a valid notification and enqueues an event', async () => {
      const applicationId = await seedFastmailApp();
      const response: Response = await SELF.fetch(
        `http://localhost/api/webhooks/fastmail/${applicationId}?token=${FASTMAIL_TOKEN}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailId: 'fm-msg-1' }),
        },
      );
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toEqual({ message: 'accepted' });
    });

    it('returns 400 when the token does not match the stored secret', async () => {
      const applicationId = await seedFastmailApp();
      const response: Response = await SELF.fetch(
        `http://localhost/api/webhooks/fastmail/${applicationId}?token=wrong-token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailId: 'fm-msg-1' }),
        },
      );
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/webhooks/outlook/lifecycle/:applicationId', () => {
    it('echoes the validation token for the subscription handshake', async () => {
      const response: Response = await SELF.fetch(
        'http://localhost/api/webhooks/outlook/lifecycle/app-1?validationToken=lifecycle-handshake',
      );
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe('lifecycle-handshake');
    });
  });

  describe('POST /user/application/digest/send', () => {
    it('returns 404 for a foreign application', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/application/digest/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: NONEXISTENT_UUID }),
      });
      expect(response.status).toBe(404);
    });
  });

  describe('POST /user/application/dismiss-error', () => {
    it('acknowledges an error for an owned application', async () => {
      const applicationId = await createApplicationViaApi('Dismiss Error App');
      const response: Response = await SELF.fetch('http://localhost/user/application/dismiss-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, errorType: 'processing' }),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { application: { applicationId: string } };
      expect(body.application.applicationId).toBe(applicationId);
    });

    it('returns 404 for a foreign application', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/application/dismiss-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: NONEXISTENT_UUID, errorType: 'processing' }),
      });
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /user/application/watch-settings', () => {
    it('persists watched folder ids for an owned application', async () => {
      const applicationId = await createApplicationViaApi('Watch Settings App');
      const response: Response = await SELF.fetch('http://localhost/user/application/watch-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, folderIds: ['INBOX'] }),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { application: { applicationId: string } };
      expect(body.application.applicationId).toBe(applicationId);
    });

    it('returns 404 for a foreign application', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/application/watch-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: NONEXISTENT_UUID, folderIds: ['INBOX'] }),
      });
      expect(response.status).toBe(404);
    });
  });
});
