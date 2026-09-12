import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { applyMigrations } from '../helpers/migrations';

describe('public API surface', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  describe('GET /api/oauth2/callback/:applicationId', () => {
    it('redirects to an error page when the provider reports an error', async () => {
      const response: Response = await SELF.fetch(
        'http://localhost/api/oauth2/callback/app-1?error=access_denied',
        { redirect: 'manual' },
      );
      expect([301, 302, 303, 307, 308]).toContain(response.status);
      expect(response.headers.get('Location')).toContain('oauth2=error');
    });

    it('returns 400 when code or state is missing', async () => {
      const response: Response = await SELF.fetch('http://localhost/api/oauth2/callback/app-1');
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/webhooks/fastmail/:applicationId', () => {
    it('returns 400 when emailId is missing', async () => {
      const response: Response = await SELF.fetch('http://localhost/api/webhooks/fastmail/app-1?token=t', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(400);
    });

    it('returns 404 for an application without a subscription', async () => {
      const response: Response = await SELF.fetch(
        'http://localhost/api/webhooks/fastmail/00000000-0000-0000-0000-000000000000?token=t',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailId: 'e-1' }),
        },
      );
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/webhooks/outlook/:applicationId validation', () => {
    it('echoes the validation token for subscription handshake', async () => {
      const response: Response = await SELF.fetch(
        'http://localhost/api/webhooks/outlook/app-1?validationToken=hello-token',
      );
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe('hello-token');
    });
  });
});
