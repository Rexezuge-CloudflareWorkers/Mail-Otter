import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF, adminSecretsStore } from 'cloudflare:test';
import type { SecretsStoreSecret } from 'cloudflare:workers';
import { applyMigrations } from '../helpers/migrations';

const TEST_EMAIL = 'test@example.com';

/**
 * Processing visibility routes now resolve via `Tokens.ProcessingService`
 * (constructor DI). These integration tests guard the migration end-to-end
 * on real D1: empty lists succeed and manual triggers validate input.
 */
describe('Processing visibility API', () => {
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

  it('lists task runs, messages, and calendar events', async () => {
    for (const path of ['/user/processing/task-runs', '/user/processing/messages', '/user/processing/calendar-events']) {
      const response: Response = await SELF.fetch(`http://localhost${path}`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toBeDefined();
    }
  });

  it('rejects unsupported manual task types', async () => {
    const response: Response = await SELF.fetch('http://localhost/user/processing/run-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskType: 'nope', applicationId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect([400, 404]).toContain(response.status);
  });

  it('requires chat query', async () => {
    const response: Response = await SELF.fetch('http://localhost/user/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '   ' }),
    });
    expect(response.status).toBe(400);
  });
});
