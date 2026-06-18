import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { CryptoUtil } from '@mail-otter/shared/utils';
import { applyMigrations } from '../helpers/migrations';

let appCounter = 0;

const CLIENT_STATE = 'test-client-state';

async function seedApplicationWithSubscription(clientStateHash?: string | null): Promise<{ applicationId: string; externalSubscriptionId: string }> {
  appCounter++;
  const applicationId = `outlook-app-${appCounter}-${Date.now()}`;
  const externalSubscriptionId = `ext-sub-${appCounter}-${Date.now()}`;
  const email = `outlook-user-${appCounter}@example.com`;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO users (email, created_at, updated_at) VALUES (?, ?, ?)`,
  ).bind(email, now, now).run();
  await env.DB.prepare(
    `INSERT INTO connected_applications (application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at) ` +
    `VALUES (?, ?, ?, 'microsoft-outlook', 'oauth2', 'enc', 'iv', 'connected', ?, ?)`,
  ).bind(applicationId, email, 'Outlook', now, now).run();
  await env.DB.prepare(
    `INSERT INTO provider_subscriptions (subscription_id, application_id, provider_id, external_subscription_id, client_state_hash, status, created_at, updated_at) ` +
    `VALUES (?, ?, 'microsoft-outlook', ?, ?, 'active', ?, ?)`,
  ).bind(`sub-${applicationId}`, applicationId, externalSubscriptionId, clientStateHash ?? null, now, now).run();
  return { applicationId, externalSubscriptionId };
}

describe('Outlook webhook endpoints', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  describe('POST /api/webhooks/outlook/:applicationId', () => {
    it('returns the validation token as text/plain when validationToken query param is present', async () => {
      const response: Response = await SELF.fetch(
        'http://localhost/api/webhooks/outlook/app-1?validationToken=abc123',
        { method: 'POST' },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/plain');
      const body: string = await response.text();
      expect(body).toBe('abc123');
    });

    it('rejects notifications for an unknown subscription', async () => {
      const response: Response = await SELF.fetch('http://localhost/api/webhooks/outlook/app-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: [
            {
              subscriptionId: 'unknown-sub',
              clientState: CLIENT_STATE,
              changeType: 'created',
              resource: 'Users/me/Messages/msg-1',
            },
          ],
        }),
      });

      expect(response.status).toBe(401);
    });

    it('accepts notifications for a known subscription and enqueues events', async () => {
      const clientStateHash: string = await CryptoUtil.sha256Hex(CLIENT_STATE);
      const { applicationId, externalSubscriptionId } = await seedApplicationWithSubscription(clientStateHash);

      const response: Response = await SELF.fetch(`http://localhost/api/webhooks/outlook/${applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: [
            {
              subscriptionId: externalSubscriptionId,
              clientState: CLIENT_STATE,
              changeType: 'created',
              resource: 'Users/me/Messages/msg-1',
              resourceData: { id: 'msg-1' },
            },
          ],
        }),
      });

      expect(response.status).toBe(202);
    });
  });

  describe('POST /api/webhooks/outlook/lifecycle/:applicationId', () => {
    it('returns validation token as text/plain when validationToken query param is present', async () => {
      const response: Response = await SELF.fetch(
        'http://localhost/api/webhooks/outlook/lifecycle/app-1?validationToken=lifecycle-token',
        { method: 'POST' },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/plain');
      const body: string = await response.text();
      expect(body).toBe('lifecycle-token');
    });

    it('handles subscriptionRemoved lifecycle event by marking the subscription as error', async () => {
      const { applicationId, externalSubscriptionId } = await seedApplicationWithSubscription(undefined);

      const response: Response = await SELF.fetch(`http://localhost/api/webhooks/outlook/lifecycle/${applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: [
            {
              subscriptionId: externalSubscriptionId,
              clientState: undefined,
              lifecycleEvent: 'subscriptionRemoved',
            },
          ],
        }),
      });

      expect(response.status).toBe(202);

      const subscriptionId = `sub-${applicationId}`;
      const sub = await env.DB.prepare(
        `SELECT status, last_error FROM provider_subscriptions WHERE subscription_id = ?`,
      ).bind(subscriptionId).first<{ status: string; last_error: string | null }>();
      expect(sub!.status).toBe('error');
      expect(sub!.last_error).toContain('subscriptionRemoved');
    });
  });
});
