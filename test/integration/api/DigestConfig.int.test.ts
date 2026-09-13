import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF, adminSecretsStore } from 'cloudflare:test';
import type { SecretsStoreSecret } from 'cloudflare:workers';
import { applyMigrations } from '../helpers/migrations';

const TEST_EMAIL = 'test@example.com';

async function createApplication(): Promise<string> {
  const response: Response = await SELF.fetch('http://localhost/user/application', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Digest Test App',
      providerId: 'google-gmail',
      connectionMethod: 'oauth2',
      clientId: 'digest-client-id',
      clientSecret: 'digest-client-secret',
      gmailPubsubTopicName: 'projects/my-project/topics/mail-otter',
    }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { application: { applicationId: string } };
  return body.application.applicationId;
}

describe('Digest config API', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
    const aesSecret = (env as Record<string, unknown>)['AES_ENCRYPTION_KEY_SECRET'] as SecretsStoreSecret | undefined;
    if (aesSecret) {
      await adminSecretsStore(aesSecret).create('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    }
    await env.DB.prepare(`INSERT OR IGNORE INTO users (email, created_at, updated_at) VALUES (?, ?, ?)`).bind(
      TEST_EMAIL,
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000),
    ).run();
  });

  it('returns defaults then persists config via DI scope', async () => {
    const applicationId = await createApplication();

    const initial: Response = await SELF.fetch(
      `http://localhost/user/application/digest?applicationId=${applicationId}`,
    );
    expect(initial.status).toBe(200);
    const initialBody = (await initial.json()) as { digestConfig: { enabled: boolean; sendTime: string } };
    expect(typeof initialBody.digestConfig.enabled).toBe('boolean');

    const updated: Response = await SELF.fetch('http://localhost/user/application/digest', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, enabled: true, sendTime: '07:30', sections: ['tasks', 'calendar'] }),
    });
    expect(updated.status).toBe(200);
    const updatedBody = (await updated.json()) as { digestConfig: { enabled: boolean; sendTime: string; sections: string[] } };
    expect(updatedBody.digestConfig.enabled).toBe(true);
    expect(updatedBody.digestConfig.sendTime).toBe('07:30');
    expect(updatedBody.digestConfig.sections).toEqual(['tasks', 'calendar']);

    const reread: Response = await SELF.fetch(
      `http://localhost/user/application/digest?applicationId=${applicationId}`,
    );
    const rereadBody = (await reread.json()) as { digestConfig: { sendTime: string } };
    expect(rereadBody.digestConfig.sendTime).toBe('07:30');
  });

  it('returns 404 for foreign applications', async () => {
    const response: Response = await SELF.fetch(
      `http://localhost/user/application/digest?applicationId=00000000-0000-0000-0000-000000000000`,
    );
    expect(response.status).toBe(404);
  });
});
