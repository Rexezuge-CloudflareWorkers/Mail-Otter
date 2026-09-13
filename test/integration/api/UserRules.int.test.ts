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
      displayName: 'Rules Test App',
      providerId: 'google-gmail',
      connectionMethod: 'oauth2',
      clientId: 'rules-client-id',
      clientSecret: 'rules-client-secret',
      gmailPubsubTopicName: 'projects/my-project/topics/mail-otter',
    }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { application: { applicationId: string } };
  return body.application.applicationId;
}

describe('User rules API', () => {
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

  it('starts with no rules then persists a rule round-trip', async () => {
    const applicationId = await createApplication();

    const empty: Response = await SELF.fetch(
      `http://localhost/user/application/rules?applicationId=${applicationId}`,
    );
    expect(empty.status).toBe(200);
    const emptyBody = (await empty.json()) as { rules: unknown[] };
    expect(emptyBody.rules).toEqual([]);

    const rule = {
      ruleId: crypto.randomUUID(),
      name: 'Star Invoices',
      enabled: true,
      conditions: { operator: 'all', matchers: [{ field: 'subject', op: 'contains', value: 'invoice' }] },
      action: { type: 'star_message' },
    };
    const updated: Response = await SELF.fetch('http://localhost/user/application/rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, rules: [rule] }),
    });
    expect(updated.status).toBe(200);

    const reread: Response = await SELF.fetch(
      `http://localhost/user/application/rules?applicationId=${applicationId}`,
    );
    expect(reread.status).toBe(200);
    const rereadBody = (await reread.json()) as { rules: Array<{ ruleId: string; name: string }> };
    expect(rereadBody.rules).toHaveLength(1);
    expect(rereadBody.rules[0].ruleId).toBe(rule.ruleId);
    expect(rereadBody.rules[0].name).toBe('Star Invoices');
  });

  it('returns 404 for foreign applications', async () => {
    const response: Response = await SELF.fetch(
      `http://localhost/user/application/rules?applicationId=00000000-0000-0000-0000-000000000000`,
    );
    expect(response.status).toBe(404);
  });
});
