import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuth2AccessTokenCacheDAO } from '@/dao';
import { OAuth2AccessTokenService } from '@/utils/OAuth2AccessTokenService';
import { OAuth2TokenNonRetryableError, OAuth2TokenRetryableError } from '@/error';

describe('OAuth2AccessTokenService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns cached access tokens without invoking the per-application Durable Object', async () => {
    vi.spyOn(OAuth2AccessTokenCacheDAO.prototype, 'getCachedAccessToken').mockResolvedValue({
      applicationId: 'app-1',
      accessToken: 'cached-token',
      expiresAt: 1778203600,
    });
    const fetch = vi.fn();
    const env = {
      AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master-key') },
      OAUTH2_TOKEN_CACHE: {} as KVNamespace,
      OAUTH2_TOKEN_REFRESHERS: {
        idFromName: vi.fn(),
        get: vi.fn(() => ({ fetch })),
      },
    } as unknown as Env;

    const accessToken: string = await OAuth2AccessTokenService.getAccessToken('app-1', env);

    expect(accessToken).toBe('cached-token');
    expect(env.OAUTH2_TOKEN_REFRESHERS.idFromName).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to the application Durable Object when the cache misses', async () => {
    vi.spyOn(OAuth2AccessTokenCacheDAO.prototype, 'getCachedAccessToken').mockResolvedValue(undefined);
    const fetch = vi.fn().mockResolvedValue(Response.json({ accessToken: 'fresh-token', expiresAt: 1778203600 }));
    const id = {} as DurableObjectId;
    const env = {
      AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master-key') },
      OAUTH2_TOKEN_CACHE: {} as KVNamespace,
      OAUTH2_TOKEN_REFRESHERS: {
        idFromName: vi.fn(() => id),
        get: vi.fn(() => ({ fetch })),
      },
    } as unknown as Env;

    const accessToken: string = await OAuth2AccessTokenService.getAccessToken('app-1', env);

    expect(accessToken).toBe('fresh-token');
    expect(env.OAUTH2_TOKEN_REFRESHERS.idFromName).toHaveBeenCalledWith('app-1');
    expect(env.OAUTH2_TOKEN_REFRESHERS.get).toHaveBeenCalledWith(id);
    const request: Request = fetch.mock.calls[0][0];
    expect(new URL(request.url).pathname).toBe('/refresh');
  });

  it('classifies token worker client failures as non-retryable', async () => {
    vi.spyOn(OAuth2AccessTokenCacheDAO.prototype, 'getCachedAccessToken').mockResolvedValue(undefined);
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: 'Connected application is not authorized.' }, { status: 400 }));
    const env = {
      AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master-key') },
      OAUTH2_TOKEN_CACHE: {} as KVNamespace,
      OAUTH2_TOKEN_REFRESHERS: {
        idFromName: vi.fn(() => ({}) as DurableObjectId),
        get: vi.fn(() => ({ fetch })),
      },
    } as unknown as Env;

    await expect(OAuth2AccessTokenService.getAccessToken('app-1', env)).rejects.toThrow(OAuth2TokenNonRetryableError);
  });

  it('classifies token worker server failures as retryable', async () => {
    vi.spyOn(OAuth2AccessTokenCacheDAO.prototype, 'getCachedAccessToken').mockResolvedValue(undefined);
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: 'Temporary failure.' }, { status: 500 }));
    const env = {
      AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master-key') },
      OAUTH2_TOKEN_CACHE: {} as KVNamespace,
      OAUTH2_TOKEN_REFRESHERS: {
        idFromName: vi.fn(() => ({}) as DurableObjectId),
        get: vi.fn(() => ({ fetch })),
      },
    } as unknown as Env;

    await expect(OAuth2AccessTokenService.getAccessToken('app-1', env)).rejects.toThrow(OAuth2TokenRetryableError);
  });
});
