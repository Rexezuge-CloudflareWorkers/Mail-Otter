import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF, adminSecretsStore } from 'cloudflare:test';
import type { SecretsStoreSecret } from 'cloudflare:workers';
import { applyMigrations } from '../helpers/migrations';

async function seedApplication(userEmail: string): Promise<string> {
  const applicationId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO connected_applications (application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at) ` +
    `VALUES (?, ?, ?, 'google-gmail', 'oauth2', 'enc', 'iv', 'draft', ?, ?)`,
  ).bind(applicationId, userEmail, 'Test Gmail', now, now).run();
  return applicationId;
}

const TEST_EMAIL = 'test@example.com';
const GMAIL_BODY = {
  displayName: 'My Gmail App',
  providerId: 'google-gmail',
  connectionMethod: 'oauth2',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  gmailPubsubTopicName: 'projects/my-project/topics/mail-otter',
};
const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

describe('User applications API', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
    const aesSecret = (env as Record<string, unknown>)['AES_ENCRYPTION_KEY_SECRET'] as SecretsStoreSecret | undefined;
    if (aesSecret) {
      const admin = adminSecretsStore(aesSecret);
      // Valid base64-encoded 32-byte (AES-256-GCM) key (32 zero bytes)
      await admin.create('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    }
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (email, created_at, updated_at) VALUES (?, ?, ?)`,
    ).bind(TEST_EMAIL, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();
  });

  describe('GET /user/me', () => {
    it('returns the authenticated user email', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/me');

      expect(response.status).toBe(200);
      const body = await response.json() as { email: string };
      expect(body.email).toBe(TEST_EMAIL);
    });
  });

  describe('GET /user/applications', () => {
    it('returns a list array', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/applications');

      expect(response.status).toBe(200);
      const body = await response.json() as { applications: unknown[] };
      expect(Array.isArray(body.applications)).toBe(true);
    });

    it('includes a seeded application in the list', async () => {
      await seedApplication(TEST_EMAIL);

      const response: Response = await SELF.fetch('http://localhost/user/applications');

      expect(response.status).toBe(200);
      const body = await response.json() as { applications: { providerId: string }[] };
      expect(body.applications.length).toBeGreaterThan(0);
    });
  });

  describe('POST /user/application', () => {
    it('creates a new Gmail application and returns it', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(GMAIL_BODY),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { application: { applicationId: string; providerId: string } };
      expect(body.application.applicationId).toBeDefined();
      expect(body.application.providerId).toBe('google-gmail');
    });

    it('creates a new Outlook application and returns it', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'My Outlook App',
          providerId: 'microsoft-outlook',
          connectionMethod: 'oauth2',
          clientId: 'outlook-client-id',
          clientSecret: 'outlook-client-secret',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { application: { providerId: string } };
      expect(body.application.providerId).toBe('microsoft-outlook');
    });

    it('returns 400 when required fields are missing', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Incomplete' }),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when gmailPubsubTopicName is missing for Gmail', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'Gmail without topic',
          providerId: 'google-gmail',
          connectionMethod: 'oauth2',
          clientId: 'cid',
          clientSecret: 'cs',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /user/application', () => {
    it('updates an existing application display name', async () => {
      const createResponse: Response = await SELF.fetch('http://localhost/user/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(GMAIL_BODY),
      });
      expect(createResponse.status).toBe(200);
      const createBody = await createResponse.json() as { application: { applicationId: string } };
      const applicationId = createBody.application.applicationId;

      const response: Response = await SELF.fetch('http://localhost/user/application', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          displayName: 'Renamed App',
          providerId: 'google-gmail',
          connectionMethod: 'oauth2',
          gmailPubsubTopicName: 'projects/my-project/topics/mail-otter',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { application: { applicationId: string } };
      expect(body.application.applicationId).toBe(applicationId);
    });

    it('returns 400 when application is not found', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/application', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: NONEXISTENT_UUID,
          displayName: 'X',
          providerId: 'google-gmail',
          connectionMethod: 'oauth2',
          gmailPubsubTopicName: 'projects/my-project/topics/mail-otter',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /user/application', () => {
    it('deletes an existing application', async () => {
      const applicationId = await seedApplication(TEST_EMAIL);

      const response: Response = await SELF.fetch('http://localhost/user/application', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { success: boolean };
      expect(body.success).toBe(true);
    });

    it('returns 200 even when application does not exist', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/application', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: NONEXISTENT_UUID }),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { success: boolean };
      expect(body.success).toBe(true);
    });
  });

  describe('POST /user/application (max limit)', () => {
    it('returns 400 when the max applications limit is reached', async () => {
      const now = Math.floor(Date.now() / 1000);
      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM connected_applications WHERE user_email = ?`,
      ).bind(TEST_EMAIL).first<{ count: number }>();
      const existing = countRow?.count ?? 0;

      for (let i = existing; i < 99; i++) {
        await env.DB.prepare(
          `INSERT INTO connected_applications (application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at) ` +
          `VALUES (?, ?, ?, 'google-gmail', 'oauth2', 'enc', 'iv', 'draft', ?, ?)`,
        ).bind(`limit-app-${i}-${Date.now()}`, TEST_EMAIL, 'App', now, now).run();
      }

      const response: Response = await SELF.fetch('http://localhost/user/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(GMAIL_BODY),
      });

      expect(response.status).toBe(400);
    });
  });
});
