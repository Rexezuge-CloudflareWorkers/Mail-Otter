import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAESGCMKey } from '@mail-otter/backend-data/crypto';
import { OAuth2AccessTokenCacheDAO } from '@mail-otter/backend-data/dao';

function createKvStore(): KVNamespace {
  const storage: Map<string, string> = new Map<string, string>();
  return {
    get: vi.fn(async (key: string): Promise<unknown | null> => {
      const value: string | undefined = storage.get(key);
      return value ? JSON.parse(value) : null;
    }),
    put: vi.fn(async (key: string, value: string): Promise<void> => {
      storage.set(key, value);
    }),
    delete: vi.fn(async (key: string): Promise<void> => {
      storage.delete(key);
    }),
  };
}

describe('OAuth2AccessTokenCacheDAO', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T00:00:00Z'));
  });

  it('stores encrypted access tokens with a namespaced KV key and TTL', async () => {
    const kv: KVNamespace = createKvStore();
    const masterKey: string = await generateAESGCMKey();
    const dao = new OAuth2AccessTokenCacheDAO(kv, masterKey);

    await dao.storeAccessToken('app-1', 'access-token', Math.floor(Date.now() / 1000) + 3600);
    const cached = await dao.getCachedAccessToken('app-1', 60);

    expect(kv.put).toHaveBeenCalledWith('OAT::app-1', expect.not.stringContaining('access-token'), { expirationTtl: 3600 });
    expect(cached).toEqual({
      applicationId: 'app-1',
      accessToken: 'access-token',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  it('deletes cached tokens that are inside the minimum validity window', async () => {
    const kv: KVNamespace = createKvStore();
    const masterKey: string = await generateAESGCMKey();
    const dao = new OAuth2AccessTokenCacheDAO(kv, masterKey);

    await dao.storeAccessToken('app-1', 'access-token', Math.floor(Date.now() / 1000) + 90);
    const cached = await dao.getCachedAccessToken('app-1', 120);

    expect(cached).toBeUndefined();
    expect(kv.delete).toHaveBeenCalledWith('OAT::app-1');
  });
});
