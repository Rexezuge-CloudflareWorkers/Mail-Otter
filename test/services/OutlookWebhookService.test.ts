import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetByExternalSubscriptionId, mockTouchNotification, mockMarkError } = vi.hoisted(() => ({
  mockGetByExternalSubscriptionId: vi.fn(),
  mockTouchNotification: vi.fn(),
  mockMarkError: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ProviderSubscriptionDAO: vi.fn(function () {
    return {
      getByExternalSubscriptionId: mockGetByExternalSubscriptionId,
      touchNotification: mockTouchNotification,
      markError: mockMarkError,
    };
  }),
}));

vi.mock('@mail-otter/provider-clients/webhook', () => ({
  WebhookSecurityUtil: {
    matchesSecret: vi.fn(),
  },
}));

import { OutlookWebhookService } from '../../packages/backend-services/src/webhook/OutlookWebhookService';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';

function makeEnv() {
  return {
    DB: {} as D1Database,
    EMAIL_EVENTS_QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
  };
}

function makeSubscription(overrides?: Record<string, unknown>) {
  return {
    subscriptionId: 'sub-1',
    applicationId: 'app-1',
    clientStateHash: 'state-hash',
    ...overrides,
  };
}

describe('OutlookWebhookService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractMessageId', () => {
    it('extracts message ID from resource string', () => {
      expect(OutlookWebhookService.extractMessageId('Users/user@example.com/Messages/AAA123')).toBe('AAA123');
    });

    it('is case-insensitive for /messages/ segment', () => {
      expect(OutlookWebhookService.extractMessageId('Users/user/MESSAGES/BBB456')).toBe('BBB456');
    });

    it('returns undefined for undefined input', () => {
      expect(OutlookWebhookService.extractMessageId(undefined)).toBeUndefined();
    });

    it('returns undefined when no /messages/ segment found', () => {
      expect(OutlookWebhookService.extractMessageId('Users/user@example.com/Folders/INBOX')).toBeUndefined();
    });

    it('returns undefined when message ID has a trailing path segment', () => {
      expect(OutlookWebhookService.extractMessageId('Users/user/Messages/AAA123/attachments')).toBeUndefined();
    });
  });

  describe('handleNotifications', () => {
    it('enqueues message using resourceData.id', async () => {
      mockGetByExternalSubscriptionId.mockResolvedValue(makeSubscription());
      (WebhookSecurityUtil.matchesSecret as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const env = makeEnv();
      await OutlookWebhookService.handleNotifications(
        'app-1',
        [{ subscriptionId: 'ext-sub-1', clientState: 'state', resourceData: { id: 'msg-1' } }],
        env,
      );

      expect(env.EMAIL_EVENTS_QUEUE.send).toHaveBeenCalledWith({
        type: 'outlook-notification',
        applicationId: 'app-1',
        subscriptionId: 'ext-sub-1',
        messageId: 'msg-1',
        callbackBaseUrl: undefined,
      });
      expect(mockTouchNotification).toHaveBeenCalledWith('sub-1');
    });

    it('falls back to extracting messageId from resource path', async () => {
      mockGetByExternalSubscriptionId.mockResolvedValue(makeSubscription());
      (WebhookSecurityUtil.matchesSecret as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const env = makeEnv();
      await OutlookWebhookService.handleNotifications(
        'app-1',
        [{ subscriptionId: 'ext-sub-1', clientState: 'state', resource: 'Users/user/Messages/MSG999' }],
        env,
        'https://api.example.com',
      );

      expect(env.EMAIL_EVENTS_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'MSG999', callbackBaseUrl: 'https://api.example.com' }),
      );
    });

    it('skips notification when no message ID can be resolved', async () => {
      mockGetByExternalSubscriptionId.mockResolvedValue(makeSubscription());
      (WebhookSecurityUtil.matchesSecret as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const env = makeEnv();
      await OutlookWebhookService.handleNotifications(
        'app-1',
        [{ subscriptionId: 'ext-sub-1', clientState: 'state' }],
        env,
      );

      expect(env.EMAIL_EVENTS_QUEUE.send).not.toHaveBeenCalled();
    });

    it('throws when subscription is not found', async () => {
      mockGetByExternalSubscriptionId.mockResolvedValue(undefined);

      await expect(
        OutlookWebhookService.handleNotifications('app-1', [{ subscriptionId: 'ext-sub-1' }], makeEnv() as never),
      ).rejects.toThrow('Unknown Outlook subscription.');
    });

    it('throws when subscription belongs to a different application', async () => {
      mockGetByExternalSubscriptionId.mockResolvedValue(makeSubscription({ applicationId: 'other-app' }));

      await expect(
        OutlookWebhookService.handleNotifications('app-1', [{ subscriptionId: 'ext-sub-1' }], makeEnv() as never),
      ).rejects.toThrow('Unknown Outlook subscription.');
    });

    it('throws when clientState is invalid', async () => {
      mockGetByExternalSubscriptionId.mockResolvedValue(makeSubscription());
      (WebhookSecurityUtil.matchesSecret as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(
        OutlookWebhookService.handleNotifications(
          'app-1',
          [{ subscriptionId: 'ext-sub-1', clientState: 'bad-state' }],
          makeEnv() as never,
        ),
      ).rejects.toThrow('Invalid Outlook clientState.');
    });

    it('processes multiple notifications', async () => {
      mockGetByExternalSubscriptionId.mockResolvedValue(makeSubscription());
      (WebhookSecurityUtil.matchesSecret as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const env = makeEnv();
      await OutlookWebhookService.handleNotifications(
        'app-1',
        [
          { subscriptionId: 'ext-sub-1', clientState: 'state', resourceData: { id: 'msg-1' } },
          { subscriptionId: 'ext-sub-1', clientState: 'state', resourceData: { id: 'msg-2' } },
        ],
        env,
      );

      expect(env.EMAIL_EVENTS_QUEUE.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleLifecycleNotifications', () => {
    it('marks error for subscriptionRemoved lifecycle event', async () => {
      mockGetByExternalSubscriptionId.mockResolvedValue(makeSubscription());

      await OutlookWebhookService.handleLifecycleNotifications(
        'app-1',
        [{ subscriptionId: 'ext-sub-1', lifecycleEvent: 'subscriptionRemoved' }],
        { DB: {} as D1Database },
      );

      expect(mockMarkError).toHaveBeenCalledWith('sub-1', 'Outlook lifecycle event: subscriptionRemoved');
    });

    it('marks error for missed lifecycle event', async () => {
      mockGetByExternalSubscriptionId.mockResolvedValue(makeSubscription());

      await OutlookWebhookService.handleLifecycleNotifications(
        'app-1',
        [{ subscriptionId: 'ext-sub-1', lifecycleEvent: 'missed' }],
        { DB: {} as D1Database },
      );

      expect(mockMarkError).toHaveBeenCalledWith('sub-1', 'Outlook lifecycle event: missed');
    });

    it('does not mark error for reauthorizationRequired', async () => {
      mockGetByExternalSubscriptionId.mockResolvedValue(makeSubscription());

      await OutlookWebhookService.handleLifecycleNotifications(
        'app-1',
        [{ subscriptionId: 'ext-sub-1', clientState: 'state', lifecycleEvent: 'reauthorizationRequired' }],
        { DB: {} as D1Database },
      );

      expect(mockMarkError).not.toHaveBeenCalled();
    });

    it('throws when subscription not found in lifecycle handler', async () => {
      mockGetByExternalSubscriptionId.mockResolvedValue(undefined);

      await expect(
        OutlookWebhookService.handleLifecycleNotifications(
          'app-1',
          [{ subscriptionId: 'ext-sub-1' }],
          { DB: {} as D1Database },
        ),
      ).rejects.toThrow('Unknown Outlook subscription.');
    });
  });
});
