import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { applyMigrations } from '../helpers/migrations';

describe('User authentication middleware', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('returns the dev auth email when DEV_AUTH_EMAIL is set', async () => {
    const response: Response = await SELF.fetch('http://localhost/user/me', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ email: 'test@example.com' });
  });
});
