import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetByIdForUser, mockGetById, mockCreateSession, mockGetActiveSession, mockConsumeSession, mockCompleteAuthorization } = vi.hoisted(
  () => ({
    mockGetByIdForUser: vi.fn(),
    mockGetById: vi.fn(),
    mockCreateSession: vi.fn(),
    mockGetActiveSession: vi.fn(),
    mockConsumeSession: vi.fn(),
    mockCompleteAuthorization: vi.fn(),
  }),
);

vi.mock('@mail-otter/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return {
      getByIdForUser: mockGetByIdForUser,
      getById: mockGetById,
    };
  }),
  OAuth2AuthorizationSessionDAO: vi.fn(function () {
    return {
      create: mockCreateSession,
      getActive: mockGetActiveSession,
      consume: mockConsumeSession,
    };
  }),
}));

vi.mock('@mail-otter/backend-runtime/config', () => ({
  ConfigurationManager: {
    getOauth2StateExpiryMinutes: vi.fn(() => 15),
  },
}));

vi.mock('@mail-otter/provider-clients/oauth2', () => ({
  OAuth2ProviderUtil: {
    buildAuthorizationUrl: vi.fn(() => 'https://provider.com/auth'),
  },
}));

vi.mock('@mail-otter/shared/utils', () => ({
  BaseUrlUtil: {
    getBaseUrl: vi.fn(() => 'https://example.com'),
  },
  TimestampUtil: {
    getCurrentUnixTimestampInSeconds: vi.fn(() => 1778200000),
    addMinutes: vi.fn((ts, m) => ts + m * 60),
  },
}));

vi.mock('../../packages/backend-services/src/oauth2/OAuth2StateUtil', () => ({
  OAuth2StateUtil: {
    generateState: vi.fn(() => 'state-token'),
    generateCodeVerifier: vi.fn(() => 'verifier'),
    getCodeChallenge: vi.fn(() => 'challenge'),
    getStateHash: vi.fn((s: string) => `hashed-${s}`),
  },
}));

vi.mock('../../packages/backend-services/src/oauth2/OAuth2AccessTokenService', () => ({
  OAuth2AccessTokenService: {
    completeAuthorization: mockCompleteAuthorization,
  },
}));

import { OAuth2AuthorizationService } from '../../packages/backend-services/src/oauth2/OAuth2AuthorizationService';

function makeEnv(overrides?: Record<string, unknown>) {
  return {
    DB: {} as D1Database,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('key') },
    OAUTH2_TOKEN_CACHE: {} as KVNamespace,
    OAUTH2_TOKEN_REFRESHERS: {} as DurableObjectNamespace,
    ...overrides,
  };
}

describe('OAuth2AuthorizationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAuthorization', () => {
    it('creates authorization session and returns URL', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        connectionMethod: 'oauth2',
        providerId: 'google-gmail',
        credentials: { clientId: 'cid', clientSecret: 'cs' },
      });

      const result = await OAuth2AuthorizationService.createAuthorization(
        'user@example.com',
        'app-1',
        makeEnv() as never,
        new Request('https://example.com'),
      );

      expect(result.authorizationUrl).toBe('https://provider.com/auth');
      expect(result.redirectUri).toBe('https://example.com/api/oauth2/callback/app-1');
    });

    it('throws when application not found', async () => {
      mockGetByIdForUser.mockResolvedValue(undefined);

      await expect(
        OAuth2AuthorizationService.createAuthorization(
          'user@example.com',
          'nonexistent',
          makeEnv() as never,
          new Request('https://example.com'),
        ),
      ).rejects.toThrow('Connected application was not found.');
    });

    it('throws when application is not OAuth2', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        connectionMethod: 'api-key',
      });

      await expect(
        OAuth2AuthorizationService.createAuthorization(
          'user@example.com',
          'app-1',
          makeEnv() as never,
          new Request('https://example.com'),
        ),
      ).rejects.toThrow('Connected application does not use OAuth2.');
    });
  });

  describe('completeCallback', () => {
    it('completes callback and consumes session', async () => {
      mockGetActiveSession.mockResolvedValue({
        sessionId: 'session-1',
        applicationId: 'app-1',
        redirectUri: 'https://example.com/callback',
        codeVerifier: 'verifier',
      });
      mockGetById.mockResolvedValue({
        applicationId: 'app-1',
        connectionMethod: 'oauth2',
        credentials: { clientId: 'cid' },
      });

      await OAuth2AuthorizationService.completeCallback(
        { applicationId: 'app-1', code: 'auth-code', state: 'state-token' },
        makeEnv() as never,
      );

      expect(mockConsumeSession).toHaveBeenCalledWith('session-1');
    });

    it('throws when session is invalid', async () => {
      mockGetActiveSession.mockResolvedValue(undefined);

      await expect(
        OAuth2AuthorizationService.completeCallback(
          { applicationId: 'app-1', code: 'code', state: 'state' },
          makeEnv() as never,
        ),
      ).rejects.toThrow('OAuth2 authorization session is invalid or expired.');
    });
  });
});
