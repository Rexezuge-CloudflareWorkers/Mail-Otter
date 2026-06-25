import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetByApplication, mockTouchNotification } = vi.hoisted(() => ({
  mockGetByApplication: vi.fn(),
  mockTouchNotification: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ProviderSubscriptionDAO: vi.fn(function () {
    return {
      getByApplication: mockGetByApplication,
      touchNotification: mockTouchNotification,
    };
  }),
}));

vi.mock('@mail-otter/provider-clients/webhook', () => ({
  WebhookSecurityUtil: {
    matchesSecret: vi.fn(),
    base64UrlDecodeToString: vi.fn(),
  },
}));

import { GmailWebhookService } from '../../packages/backend-services/src/webhook/GmailWebhookService';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';

function makeEnv() {
  return {
    DB: {} as D1Database,
    EMAIL_EVENTS_QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('GmailWebhookService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleNotification', () => {
    it('enqueues message for valid notification', async () => {
      mockGetByApplication.mockResolvedValue({ subscriptionId: 'sub-1', webhookSecretHash: 'hash' });
      (WebhookSecurityUtil.matchesSecret as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (WebhookSecurityUtil.base64UrlDecodeToString as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({ historyId: '42', emailAddress: 'user@gmail.com' }),
      );

      const env = makeEnv();
      await GmailWebhookService.handleNotification(
        { applicationId: 'app-1', token: 'valid-token', messageData: 'encoded', pubsubMessageId: 'msg-1', callbackBaseUrl: 'https://api.example.com' },
        env,
      );

      expect(env.EMAIL_EVENTS_QUEUE.send).toHaveBeenCalledWith({
        type: 'gmail-notification',
        applicationId: 'app-1',
        notificationHistoryId: '42',
        pubsubMessageId: 'msg-1',
        callbackBaseUrl: 'https://api.example.com',
      });
      expect(mockTouchNotification).toHaveBeenCalledWith('sub-1');
    });

    it('throws when subscription is not found', async () => {
      mockGetByApplication.mockResolvedValue(undefined);

      await expect(
        GmailWebhookService.handleNotification(
          { applicationId: 'app-1', token: 'token', messageData: 'data' },
          makeEnv() as never,
        ),
      ).rejects.toThrow('Invalid Gmail webhook token.');
    });

    it('throws when token does not match subscription hash', async () => {
      mockGetByApplication.mockResolvedValue({ subscriptionId: 'sub-1', webhookSecretHash: 'hash' });
      (WebhookSecurityUtil.matchesSecret as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(
        GmailWebhookService.handleNotification(
          { applicationId: 'app-1', token: 'bad-token', messageData: 'data' },
          makeEnv() as never,
        ),
      ).rejects.toThrow('Invalid Gmail webhook token.');
    });

    it('throws when historyId is missing from decoded message', async () => {
      mockGetByApplication.mockResolvedValue({ subscriptionId: 'sub-1', webhookSecretHash: 'hash' });
      (WebhookSecurityUtil.matchesSecret as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (WebhookSecurityUtil.base64UrlDecodeToString as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({ emailAddress: 'user@gmail.com' }),
      );

      await expect(
        GmailWebhookService.handleNotification(
          { applicationId: 'app-1', token: 'token', messageData: 'data' },
          makeEnv() as never,
        ),
      ).rejects.toThrow('Gmail notification was missing historyId.');
    });

    it('works without optional pubsubMessageId and callbackBaseUrl', async () => {
      mockGetByApplication.mockResolvedValue({ subscriptionId: 'sub-1', webhookSecretHash: 'hash' });
      (WebhookSecurityUtil.matchesSecret as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (WebhookSecurityUtil.base64UrlDecodeToString as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({ historyId: '99' }),
      );

      const env = makeEnv();
      await GmailWebhookService.handleNotification(
        { applicationId: 'app-1', token: 'token', messageData: 'data' },
        env,
      );

      expect(env.EMAIL_EVENTS_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({ notificationHistoryId: '99', pubsubMessageId: undefined }),
      );
    });
  });
});
