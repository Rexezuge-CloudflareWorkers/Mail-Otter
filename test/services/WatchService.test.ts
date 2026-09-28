import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
User-scoped calls take the account identity: id for ownership, anchor for stored keys.
*/
const TEST_SCOPE = { id: 'usr_0123456789abcdef0123456789abcdef', anchorEmail: 'user@example.com' };

const { mockGetByIdForUser, mockGetByApplication, mockUpsertActive, mockMarkStopped } = vi.hoisted(() => ({
  mockGetByIdForUser: vi.fn(),
  mockGetByApplication: vi.fn(),
  mockUpsertActive: vi.fn(),
  mockMarkStopped: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return { getByIdForUser: mockGetByIdForUser };
  }),
  ProviderSubscriptionDAO: vi.fn(function () {
    return {
      getByApplication: mockGetByApplication,
      upsertActive: mockUpsertActive,
      markStopped: mockMarkStopped,
    };
  }),
}));

vi.mock('@mail-otter/provider-clients/gmail', () => ({
  GmailProviderUtil: {
    watchInbox: vi.fn(),
    stopWatch: vi.fn(),
  },
}));

vi.mock('@mail-otter/provider-clients/outlook', () => ({
  OutlookProviderUtil: {
    createInboxSubscription: vi.fn(),
    deleteSubscription: vi.fn(),
  },
}));

vi.mock('@mail-otter/provider-clients/webhook', () => ({
  WebhookSecurityUtil: {
    generateSecret: vi.fn(() => 'webhook-secret'),
    hashSecret: vi.fn(() => 'hashed-secret'),
  },
}));

vi.mock('@mail-otter/backend-runtime/config', () => ({
  ConfigurationManager: {
    getOutlookSubscriptionTtlDays: vi.fn(() => 6),
  },
}));

vi.mock('@mail-otter/shared/utils', () => ({
  TimestampUtil: {
    getCurrentUnixTimestampInSeconds: vi.fn(() => 1_778_200_000),
    addDays: vi.fn((ts, d) => ts + d * 86_400),
  },
}));

vi.mock('../../packages/backend-services/src/oauth2/OAuth2AccessTokenService', () => ({
  OAuth2AccessTokenService: vi.fn(function () {
    return { getAccessToken: vi.fn().mockResolvedValue('access-token') };
  }),
}));

import { WatchService, WatchServiceFactory } from '../../packages/backend-services/src/subscription/WatchService';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';

function makeEnv(overrides?: Record<string, unknown>) {
  return {
    DB: {} as D1Database,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('key') },
    OAUTH2_TOKEN_CACHE: {} as KVNamespace,
    OAUTH2_TOKEN_REFRESHERS: {} as DurableObjectNamespace,
    ...overrides,
  };
}

describe('WatchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('startApplicationWatch', () => {
    it('starts Gmail watch', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        userEmail: 'user@example.com',
        providerId: 'google-gmail',
        providerEmail: 'user@gmail.com',
        status: 'connected',
        gmailPubsubTopicName: 'projects/p/topics/t',
        watchedFolders: null,
        credentials: { clientId: 'cid' },
      });
      mockUpsertActive.mockResolvedValue({
        status: 'active',
        expiresAt: 1_778_200_000 + 86_400 * 3,
      });
      (GmailProviderUtil.watchInbox as ReturnType<typeof vi.fn>).mockResolvedValue({
        historyId: '12345',
        expiresAt: 1_778_200_000 + 86_400 * 3,
      });

      const result = await new WatchService(makeEnv()).startApplicationWatch(TEST_SCOPE, 'app-1', 'https://example.com');

      expect(result.message).toContain('Gmail watch started');
      expect(result.webhookUrl).toContain('/api/webhooks/gmail/app-1');
    });

    it('starts Outlook watch', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        userEmail: 'user@example.com',
        providerId: 'microsoft-outlook',
        providerEmail: 'user@outlook.com',
        status: 'connected',
        gmailPubsubTopicName: null,
        watchedFolders: null,
        credentials: { clientId: 'cid' },
      });
      mockUpsertActive.mockResolvedValue({ status: 'active', expiresAt: 1_778_200_000 + 86_400 * 6 });
      (OutlookProviderUtil.createInboxSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sub-1',
        resource: 'mail',
        expiresAt: 1_778_200_000 + 86_400 * 6,
      });

      const result = await new WatchService(makeEnv()).startApplicationWatch(TEST_SCOPE, 'app-1', 'https://example.com');

      expect(result.message).toContain('Outlook subscription started');
      expect(result.webhookUrl).toContain('/api/webhooks/outlook/app-1');
      expect(OutlookProviderUtil.createInboxSubscription).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('/api/webhooks/outlook/app-1'),
        expect.stringContaining('/api/webhooks/outlook/lifecycle/app-1'),
        expect.any(String),
        expect.any(Number),
        undefined,
      );
    });

    it('throws when application not connected', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        status: 'draft',
        providerEmail: 'user@gmail.com',
        credentials: { clientId: 'cid' },
      });

      await expect(new WatchService(makeEnv()).startApplicationWatch(TEST_SCOPE, 'app-1', 'https://example.com')).rejects.toThrow(
        'Complete authorization',
      );
    });

    it('throws when missing provider email', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        status: 'connected',
        providerEmail: null,
        credentials: { clientId: 'cid' },
      });

      await expect(new WatchService(makeEnv()).startApplicationWatch(TEST_SCOPE, 'app-1', 'https://example.com')).rejects.toThrow(
        'missing provider mailbox metadata',
      );
    });

    it('throws when Gmail watch without pubsub topic', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        status: 'connected',
        providerId: 'google-gmail',
        providerEmail: 'user@gmail.com',
        gmailPubsubTopicName: null,
        credentials: { clientId: 'cid' },
      });

      await expect(new WatchService(makeEnv()).startApplicationWatch(TEST_SCOPE, 'app-1', 'https://example.com')).rejects.toThrow(
        'Gmail Pub/Sub topic name is required',
      );
    });

    it('throws for unsupported provider', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        status: 'connected',
        providerId: 'unknown',
        providerEmail: 'user@unknown.com',
        credentials: { clientId: 'cid' },
      });

      await expect(new WatchService(makeEnv()).startApplicationWatch(TEST_SCOPE, 'app-1', 'https://example.com')).rejects.toThrow(
        'Unsupported provider',
      );
    });
  });

  describe('stopApplicationWatch', () => {
    it('stops Gmail watch', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        providerId: 'google-gmail',
        status: 'connected',
        providerEmail: 'user@gmail.com',
        credentials: { clientId: 'cid' },
      });
      mockGetByApplication.mockResolvedValue(undefined);

      await new WatchService(makeEnv()).stopApplicationWatch(TEST_SCOPE, 'app-1');
      expect(mockMarkStopped).toHaveBeenCalledWith('app-1');
    });

    it('stops Outlook watch with subscription deletion', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        providerId: 'microsoft-outlook',
        status: 'connected',
        providerEmail: 'user@outlook.com',
        credentials: { clientId: 'cid' },
      });
      mockGetByApplication.mockResolvedValue({ externalSubscriptionId: 'sub-1' });

      await new WatchService(makeEnv()).stopApplicationWatch(TEST_SCOPE, 'app-1');
      expect(OutlookProviderUtil.deleteSubscription).toHaveBeenCalled();
      expect(mockMarkStopped).toHaveBeenCalledWith('app-1');
    });
  });

  describe('standalone construction', () => {
    it('scopes ownership on the account id', async () => {
      // Passing a bare address here used to "work" only because the fake DAO
      // ignored its arguments, which is exactly the coupling the identity change
      // removed. Assert the id actually reaches the ownership predicate.
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        userEmail: 'user@example.com',
        providerId: 'google-gmail',
        providerEmail: 'user@gmail.com',
        status: 'draft',
        watchedFolders: null,
        credentials: { clientId: 'cid' },
      });

      await expect(new WatchService(makeEnv()).startApplicationWatch(TEST_SCOPE, 'app-1', 'https://example.com')).rejects.toThrow(
        'Complete authorization',
      );
      expect(mockGetByIdForUser).toHaveBeenCalledWith('app-1', TEST_SCOPE);
    });

    it('builds through the exported factory with only the env', async () => {
      // The standalone path has to work: `UserService` and the ops tooling build
      // services without a composition root, so the default DAO and token-service
      // factories have to resolve against a bare env.
      mockGetByIdForUser.mockResolvedValue(undefined);
      const service = WatchServiceFactory.create(makeEnv());
      await expect(service.stopApplicationWatch(TEST_SCOPE, 'missing')).rejects.toThrow('Connected application was not found');
    });
  });
});
