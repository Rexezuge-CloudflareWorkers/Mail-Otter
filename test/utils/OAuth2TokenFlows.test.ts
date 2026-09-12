import { afterEach, describe, expect, it, vi } from 'vitest';
import { OAuth2ProviderUtil } from '@mail-otter/provider-clients/oauth2';
import { PROVIDER_GOOGLE_GMAIL } from '@mail-otter/shared/constants';
import { BadRequestError, InternalServerError } from '@mail-otter/backend-errors';

function mockTokenResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('OAuth2ProviderUtil token flows', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const creds = { clientId: 'cid', clientSecret: 'cs', refreshToken: 'rt' };

  it('exchanges an authorization code for tokens', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockTokenResponse(200, { access_token: 'at', refresh_token: 'rt2', expires_in: 3600 })));
    const result = await OAuth2ProviderUtil.exchangeCode({
      providerId: PROVIDER_GOOGLE_GMAIL,
      credentials: creds,
      redirectUri: 'https://x/cb',
      code: 'code',
      codeVerifier: 'verifier',
    });
    expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt2', expiresIn: 3600 });
  });

  it('rejects code exchange without a refresh token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockTokenResponse(200, { access_token: 'at' })));
    await expect(
      OAuth2ProviderUtil.exchangeCode({ providerId: PROVIDER_GOOGLE_GMAIL, credentials: creds, redirectUri: 'https://x/cb', code: 'c', codeVerifier: 'v' }),
    ).rejects.toThrow(BadRequestError);
  });

  it('maps 4xx token errors to BadRequest and 5xx to InternalServerError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockTokenResponse(400, { error: 'invalid_grant', error_description: 'expired' })));
    await expect(
      OAuth2ProviderUtil.exchangeCode({ providerId: PROVIDER_GOOGLE_GMAIL, credentials: creds, redirectUri: 'https://x/cb', code: 'c', codeVerifier: 'v' }),
    ).rejects.toThrow(/invalid_grant|expired/);
    try {
      await OAuth2ProviderUtil.exchangeCode({ providerId: PROVIDER_GOOGLE_GMAIL, credentials: creds, redirectUri: 'https://x/cb', code: 'c', codeVerifier: 'v' });
      expect.unreachable();
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);
    }
    vi.stubGlobal('fetch', vi.fn(async () => mockTokenResponse(500, {})));
    await expect(
      OAuth2ProviderUtil.refreshAccessToken({ providerId: PROVIDER_GOOGLE_GMAIL, credentials: creds }),
    ).rejects.toThrow(InternalServerError);
  });

  it('requires an existing refresh token before refreshing', async () => {
    await expect(
      OAuth2ProviderUtil.refreshAccessToken({ providerId: PROVIDER_GOOGLE_GMAIL, credentials: { clientId: 'c', clientSecret: 's' } }),
    ).rejects.toThrow(BadRequestError);
  });

  it('refreshes without rotating the refresh token and parses string expiry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockTokenResponse(200, { access_token: 'at2', expires_in: '7200' })));
    const result = await OAuth2ProviderUtil.refreshAccessToken({ providerId: PROVIDER_GOOGLE_GMAIL, credentials: creds });
    expect(result).toEqual({ accessToken: 'at2', refreshToken: undefined, expiresIn: 7200 });
  });

  it('drops invalid expiry values and falls back to TTL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockTokenResponse(200, { access_token: 'a', refresh_token: 'r', expires_in: -5 })));
    const result = await OAuth2ProviderUtil.exchangeCode({ providerId: PROVIDER_GOOGLE_GMAIL, credentials: creds, redirectUri: 'https://x/cb', code: 'c', codeVerifier: 'v' });
    expect(result.expiresIn).toBeUndefined();
    expect(OAuth2ProviderUtil.getExpiresInSeconds(result, 3600)).toBe(3600);
    expect(OAuth2ProviderUtil.getExpiresInSeconds({ accessToken: 'a', expiresIn: 100 }, 3600)).toBe(100);
  });

  it('builds authorization URLs with feature scopes and rejects unknown providers', async () => {
    const url = new URL(
      OAuth2ProviderUtil.buildAuthorizationUrl({
        providerId: PROVIDER_GOOGLE_GMAIL,
        clientId: 'c',
        redirectUri: 'https://x/cb',
        state: 's',
        codeChallenge: 'cc',
        enabledFeatures: ['context_indexing', 'unknown_feature'],
      }),
    );
    expect(url.searchParams.get('scope')).toContain('gmail.readonly');
    expect(() =>
      OAuth2ProviderUtil.buildAuthorizationUrl({ providerId: 'nope', clientId: 'c', redirectUri: 'https://x', state: 's', codeChallenge: 'cc' }),
    ).toThrow();
  });
});
