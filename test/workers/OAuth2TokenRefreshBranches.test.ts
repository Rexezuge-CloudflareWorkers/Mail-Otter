import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConnectedApplicationDAO,
  OAuth2AccessTokenCacheDAO,
  OAuth2AccessTokenRefreshStatusDAO,
} from '@mail-otter/backend-data/dao';
import { OAuth2TokenRefreshWorker } from '@mail-otter/background';

function createEnv(): Env {
  return {
    DB: { withSession: vi.fn(() => ({})) } as unknown as D1Database,
    OAUTH2_TOKEN_CACHE: {} as KVNamespace,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master-key') } as unknown as SecretsStoreSecret,
  } as Env;
}

describe('OAuth2TokenRefreshWorker request handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function worker() {
    return new OAuth2TokenRefreshWorker({ waitUntil: vi.fn() }, createEnv());
  }

  it('returns 404 for unknown paths and 405 for wrong methods', async () => {
    const w = worker();
    const notFound = await w.fetch(new Request('https://x/nope', { method: 'POST' }));
    expect(notFound.status).toBe(404);
    const wrongMethod = await w.fetch(new Request('https://x/refresh', { method: 'GET' }));
    expect(wrongMethod.status).toBe(405);
  });

  it('returns 400 when required fields are missing', async () => {
    const response = await worker().fetch(
      new Request('https://x/refresh', { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('applicationId') });
  });

  it('returns 404 when the application does not exist', async () => {
    vi.spyOn(OAuth2AccessTokenCacheDAO.prototype, 'getCachedAccessToken').mockResolvedValue(undefined);
    vi.spyOn(OAuth2AccessTokenRefreshStatusDAO.prototype, 'recordRefreshStarted').mockResolvedValue(undefined);
    vi.spyOn(OAuth2AccessTokenRefreshStatusDAO.prototype, 'recordRefreshFailure').mockResolvedValue(undefined);
    vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue(undefined);
    const response = await worker().fetch(
      new Request('https://x/refresh', {
        method: 'POST',
        body: JSON.stringify({ applicationId: 'missing', minValidSeconds: 60 }),
      }),
    );
    expect(response.status).toBe(404);
  });

  it('tolerates unreadable request bodies', async () => {
    const bad = new Request('https://x/refresh', { method: 'POST' });
    vi.spyOn(bad, 'json').mockRejectedValue(new Error('bad json'));
    const response = await worker().fetch(bad);
    expect(response.status).toBe(400);
  });
});
