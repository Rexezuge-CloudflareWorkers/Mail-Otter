import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectedApplicationDAO, OAuth2AccessTokenCacheDAO, OAuth2AccessTokenRefreshStatusDAO } from '@/dao';
import { OAuth2ProviderUtil } from '@/utils/OAuth2ProviderUtil';
import { OutlookProviderUtil } from '@/utils/OutlookProviderUtil';
import { OAuth2TokenRefreshWorker } from '@/workers/OAuth2TokenRefreshWorker';
import { CONNECTED_APPLICATION_STATUS_CONNECTED, CONNECTION_METHOD_OAUTH2, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import type { ConnectedApplication } from '@mail-otter/shared/model';

function createDurableObjectState(): DurableObjectState {
  return {
    waitUntil: vi.fn(),
  } as unknown as DurableObjectState;
}

function createEnv(): Env {
  return {
    DB: {} as D1Database,
    OAUTH2_TOKEN_CACHE: {} as KVNamespace,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master-key') } as unknown as SecretsStoreSecret,
    OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS: '3600',
    OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS: '60',
  } as Env;
}

function createApplication(): ConnectedApplication {
  return {
    applicationId: 'app-1',
    userEmail: 'user@example.com',
    providerEmail: 'user@example.com',
    displayName: 'Outlook',
    providerId: PROVIDER_MICROSOFT_OUTLOOK,
    connectionMethod: CONNECTION_METHOD_OAUTH2,
    credentials: { clientId: 'client-id', clientSecret: 'client-secret', refreshToken: 'refresh-token' },
    status: CONNECTED_APPLICATION_STATUS_CONNECTED,
    contextIndexingEnabled: false,
    createdAt: 1778200000,
    updatedAt: 1778200000,
  };
}

function createRefreshRequest(): Request {
  return new Request('https://oauth2-token-refreshers.invalid/refresh', {
    method: 'POST',
    body: JSON.stringify({
      applicationId: 'app-1',
      minValidSeconds: 60,
    }),
  });
}

describe('OAuth2TokenRefreshWorker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T00:00:00Z'));
    vi.spyOn(OAuth2AccessTokenRefreshStatusDAO.prototype, 'recordRefreshStarted').mockResolvedValue();
    vi.spyOn(OAuth2AccessTokenRefreshStatusDAO.prototype, 'recordRefreshSuccess').mockResolvedValue();
    vi.spyOn(OAuth2AccessTokenRefreshStatusDAO.prototype, 'recordRefreshFailure').mockResolvedValue();
    vi.spyOn(OAuth2AccessTokenCacheDAO.prototype, 'storeAccessToken').mockResolvedValue();
  });

  it('uses a valid cached token without refreshing through the provider', async () => {
    vi.spyOn(OAuth2AccessTokenCacheDAO.prototype, 'getCachedAccessToken').mockResolvedValue({
      applicationId: 'app-1',
      accessToken: 'cached-token',
      expiresAt: 1778203600,
    });
    const refreshSpy = vi.spyOn(OAuth2ProviderUtil, 'refreshAccessToken');
    const worker = new OAuth2TokenRefreshWorker(createDurableObjectState(), createEnv());

    const response: Response = await worker.fetch(createRefreshRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accessToken: 'cached-token',
      expiresAt: 1778203600,
    });
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('refreshes once when concurrent requests target the same application durable object', async () => {
    vi.spyOn(OAuth2AccessTokenCacheDAO.prototype, 'getCachedAccessToken')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        applicationId: 'app-1',
        accessToken: 'fresh-access-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
    vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue(createApplication());
    vi.spyOn(ConnectedApplicationDAO.prototype, 'updateOAuth2RefreshToken').mockResolvedValue();
    let resolveRefresh: (value: { accessToken: string; refreshToken: string; expiresIn: number }) => void = () => undefined;
    const refreshSpy = vi.spyOn(OAuth2ProviderUtil, 'refreshAccessToken').mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const worker = new OAuth2TokenRefreshWorker(createDurableObjectState(), createEnv());

    const firstResponsePromise: Promise<Response> = worker.fetch(createRefreshRequest());
    await Promise.resolve();
    const secondResponsePromise: Promise<Response> = worker.fetch(createRefreshRequest());
    await Promise.resolve();

    resolveRefresh({ accessToken: 'fresh-access-token', refreshToken: 'rotated-refresh-token', expiresIn: 3600 });

    const firstResponse: Response = await firstResponsePromise;
    const secondResponse: Response = await secondResponsePromise;

    expect(refreshSpy).toHaveBeenCalledOnce();
    await expect(firstResponse.json()).resolves.toMatchObject({ accessToken: 'fresh-access-token' });
    await expect(secondResponse.json()).resolves.toMatchObject({ accessToken: 'fresh-access-token' });
    expect(ConnectedApplicationDAO.prototype.updateOAuth2RefreshToken).toHaveBeenCalledWith('app-1', 'rotated-refresh-token');
  });

  it('handles authorization code exchange and seeds the token cache', async () => {
    vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue(createApplication());
    vi.spyOn(ConnectedApplicationDAO.prototype, 'markOAuth2Connected').mockResolvedValue();
    vi.spyOn(OAuth2ProviderUtil, 'exchangeCode').mockResolvedValue({
      accessToken: 'exchange-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
    });
    vi.spyOn(OutlookProviderUtil, 'getProfile').mockResolvedValue({ emailAddress: 'mailbox@example.com' });
    const worker = new OAuth2TokenRefreshWorker(createDurableObjectState(), createEnv());

    const response: Response = await worker.fetch(
      new Request('https://oauth2-token-refreshers.invalid/exchange', {
        method: 'POST',
        body: JSON.stringify({
          applicationId: 'app-1',
          redirectUri: 'https://mail.example.com/api/oauth2/callback/app-1',
          code: 'code',
          codeVerifier: 'verifier',
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accessToken: 'exchange-access-token',
      providerEmail: 'mailbox@example.com',
    });
    expect(ConnectedApplicationDAO.prototype.markOAuth2Connected).toHaveBeenCalledWith('app-1', 'new-refresh-token', 'mailbox@example.com');
    expect(OAuth2AccessTokenCacheDAO.prototype.storeAccessToken).toHaveBeenCalledWith(
      'app-1',
      'exchange-access-token',
      Math.floor(Date.now() / 1000) + 3600,
    );
  });
});
