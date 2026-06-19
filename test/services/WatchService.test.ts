import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    getCurrentUnixTimestampInSeconds: vi.fn(() => 1778200000),
    addDays: vi.fn((ts, d) => ts + d * 86400),
  },
}));

vi.mock('../../packages/backend-services/src/oauth2/OAuth2AccessTokenService', () => ({
  OAuth2AccessTokenService: {
    getAccessToken: vi.fn(() => 'access-token'),
  },
}));

import { WatchService } from '../../packages/backend-services/src/subscription/WatchService';
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
        expiresAt: 1778200000 + 86400 * 3,
      });
      (GmailProviderUtil.watchInbox as ReturnType<typeof vi.fn>).mockResolvedValue({
        historyId: '12345',
        expiresAt: 1778200000 + 86400 * 3,
      });

      const result = await WatchService.startApplicationWatch(
        'user@example.com',
        'app-1',
        'https://example.com',
        makeEnv(),
      );

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
      mockUpsertActive.mockResolvedValue({ status: 'active', expiresAt: 1778200000 + 86400 * 6 });
      (OutlookProviderUtil.createInboxSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sub-1',
        resource: 'mail',
        expiresAt: 1778200000 + 86400 * 6,
      });

      const result = await WatchService.startApplicationWatch(
        'user@example.com',
        'app-1',
        'https://example.com',
        makeEnv(),
      );

      expect(result.message).toContain('Outlook subscription started');
      expect(result.webhookUrl).toContain('/api/webhooks/outlook/app-1');
    });

    it('throws when application not connected', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        status: 'draft',
        providerEmail: 'user@gmail.com',
        credentials: { clientId: 'cid' },
      });

      await expect(
        WatchService.startApplicationWatch('user@example.com', 'app-1', 'https://example.com', makeEnv()),
      ).rejects.toThrow('Complete OAuth2 authorization');
    });

    it('throws when missing provider email', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        status: 'connected',
        providerEmail: null,
        credentials: { clientId: 'cid' },
      });

      await expect(
        WatchService.startApplicationWatch('user@example.com', 'app-1', 'https://example.com', makeEnv()),
      ).rejects.toThrow('missing provider mailbox metadata');
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

      await expect(
        WatchService.startApplicationWatch('user@example.com', 'app-1', 'https://example.com', makeEnv()),
      ).rejects.toThrow('Gmail Pub/Sub topic name is required');
    });

    it('throws for unsupported provider', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        status: 'connected',
        providerId: 'unknown',
        providerEmail: 'user@unknown.com',
        credentials: { clientId: 'cid' },
      });

      await expect(
        WatchService.startApplicationWatch('user@example.com', 'app-1', 'https://example.com', makeEnv()),
      ).rejects.toThrow('Unsupported provider.');
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

      await WatchService.stopApplicationWatch('user@example.com', 'app-1', makeEnv());
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

      await WatchService.stopApplicationWatch('user@example.com', 'app-1', makeEnv());
      expect(OutlookProviderUtil.deleteSubscription).toHaveBeenCalled();
      expect(mockMarkStopped).toHaveBeenCalledWith('app-1');
    });
  });
});
