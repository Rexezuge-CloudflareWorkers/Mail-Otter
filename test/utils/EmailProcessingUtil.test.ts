import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailProcessingUtil, EmailSummaryUtil } from '@mail-otter/backend-services/email';
import type { EmailProcessingEnv } from '@mail-otter/backend-services/email';
import { ConnectedApplicationDAO, ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import type { OutlookMessage } from '@mail-otter/provider-clients/outlook';
import { NonRetryableError, RetryableError } from '@mail-otter/backend-errors';

describe('EmailProcessingUtil', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveApplication', () => {
    it('classifies missing applications as non-retryable', async () => {
      vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue(undefined);

      await expect(
        EmailProcessingUtil.resolveApplication(createOutlookQueueMessage(), createEnv()),
      ).rejects.toThrow(NonRetryableError);
    });

    it('classifies applications without a provider email as non-retryable', async () => {
      vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue({
        applicationId: 'app-1',
        userEmail: 'owner@example.com',
        providerId: 'microsoft-outlook',
        providerEmail: undefined,
        credentials: { refreshToken: 'refresh-token' },
      } as never);

      await expect(
        EmailProcessingUtil.resolveApplication(createOutlookQueueMessage(), createEnv()),
      ).rejects.toThrow(NonRetryableError);
    });
  });

  describe('processOutlookMessage', () => {
    it('marks Outlook messages as skipped when they are deleted before processing', async () => {
      const tryStart = vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
      const markSkipped = vi.spyOn(ProcessedMessageDAO.prototype, 'markSkipped').mockResolvedValue();
      const markError = vi.spyOn(ProcessedMessageDAO.prototype, 'markError').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'getMessage').mockRejectedValue(
        new Error(
          'Microsoft Graph API error: The specified object was not found in the store., The process failed to get the correct properties.',
        ),
      );

      await expect(
        EmailProcessingUtil.processOutlookMessage(createApplication(), 'access-token', 'message-1', createEnv(), []),
      ).resolves.toBeUndefined();

      expect(tryStart).toHaveBeenCalledWith('app-1', 'microsoft-outlook', 'message-1', null, { allowExistingForRetry: false });
      expect(markSkipped).toHaveBeenCalledWith('app-1', 'message-1', 'Outlook message was deleted before Mail-Otter could process it.');
      expect(markError).not.toHaveBeenCalled();
    });

    it('allows workflow retry attempts to resume existing processed-message rows', async () => {
      const tryStart = vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
      vi.spyOn(ProcessedMessageDAO.prototype, 'markSkipped').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'getMessage').mockRejectedValue(
        new Error(
          'Microsoft Graph API error: The specified object was not found in the store., The process failed to get the correct properties.',
        ),
      );

      await expect(
        EmailProcessingUtil.processOutlookMessage(createApplication(), 'access-token', 'message-1', createEnv(), [], { retryAttempt: 2 }),
      ).resolves.toBeUndefined();

      expect(tryStart).toHaveBeenCalledWith('app-1', 'microsoft-outlook', 'message-1', null, { allowExistingForRetry: true });
    });

    it('classifies unexpected processing failures as retryable and records the error', async () => {
      vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
      const markError = vi.spyOn(ProcessedMessageDAO.prototype, 'markError').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'getMessage').mockRejectedValue(new Error('Temporary Graph failure.'));

      await expect(
        EmailProcessingUtil.processOutlookMessage(createApplication(), 'access-token', 'message-1', createEnv(), []),
      ).rejects.toThrow(RetryableError);

      expect(markError).toHaveBeenCalledWith('app-1', 'message-1', 'Temporary Graph failure.');
    });

    it('skips moved Outlook messages when the stable internet message id was already processed', async () => {
      const tryStart = vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(false);
      const summarizeEmail = vi.spyOn(EmailSummaryUtil, 'summarizeEmail').mockResolvedValue('Summary text');
      const sendSelfSummaryReply = vi.spyOn(OutlookProviderUtil, 'sendSelfSummaryReply').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'getMessage').mockResolvedValue(
        createOutlookMessage({ id: 'moved-message-2', conversationId: 'conversation-1', internetMessageId: '<original@example.com>' }),
      );

      await expect(
        EmailProcessingUtil.processOutlookMessage(createApplication(), 'access-token', 'moved-message-2', createEnv(), []),
      ).resolves.toBeUndefined();

      expect(tryStart).toHaveBeenCalledWith('app-1', 'microsoft-outlook', 'moved-message-2', 'conversation-1', {
        allowExistingForRetry: false,
        providerStableMessageFingerprint: expect.any(String),
      });
      expect(summarizeEmail).not.toHaveBeenCalled();
      expect(sendSelfSummaryReply).not.toHaveBeenCalled();
    });

    it('summarizes new Outlook replies in an already seen conversation when the stable message id is new', async () => {
      const tryStart = vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
      const markSummarized = vi.spyOn(ProcessedMessageDAO.prototype, 'markSummarized').mockResolvedValue();
      vi.spyOn(ProcessedMessageDAO.prototype, 'markError').mockResolvedValue();
      const summarizeEmail = vi.spyOn(EmailSummaryUtil, 'summarizeEmail').mockResolvedValue('Summary text');
      const sendSelfSummaryReply = vi.spyOn(OutlookProviderUtil, 'sendSelfSummaryReply').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'getMessage').mockResolvedValue(
        createOutlookMessage({ id: 'reply-message-2', conversationId: 'conversation-1', internetMessageId: '<reply-2@example.com>' }),
      );

      await expect(
        EmailProcessingUtil.processOutlookMessage(createApplication(), 'access-token', 'reply-message-2', createEnv(), []),
      ).resolves.toBeUndefined();

      expect(tryStart).toHaveBeenCalledWith('app-1', 'microsoft-outlook', 'reply-message-2', 'conversation-1', {
        allowExistingForRetry: false,
        providerStableMessageFingerprint: expect.any(String),
      });
      expect(summarizeEmail).toHaveBeenCalledOnce();
      expect(sendSelfSummaryReply).toHaveBeenCalledOnce();
      expect(markSummarized).toHaveBeenCalledWith('app-1', 'reply-message-2');
    });
  });
});

function createApplication() {
  return {
    applicationId: 'app-1',
    userEmail: 'owner@example.com',
    providerId: 'microsoft-outlook',
    providerEmail: 'owner@example.com',
    credentials: { refreshToken: 'refresh-token' },
  } as never;
}

function createOutlookQueueMessage() {
  return {
    type: 'outlook-notification',
    applicationId: 'app-1',
    subscriptionId: 'subscription-1',
    messageId: 'message-1',
  } as never;
}

function createOutlookMessage(overrides: Partial<OutlookMessage> = {}): OutlookMessage {
  return {
    id: 'message-1',
    subject: 'Project update',
    conversationId: 'conversation-1',
    internetMessageId: '<message-1@example.com>',
    body: { contentType: 'text', content: 'Please review the project update.' },
    from: { emailAddress: { address: 'sender@example.com' } },
    internetMessageHeaders: [],
    ...overrides,
  };
}

function createEnv(): EmailProcessingEnv {
  return {
    DB: {} as D1Database,
    AES_ENCRYPTION_KEY_SECRET: {
      get: vi.fn().mockResolvedValue('master-key'),
    } as never,
    OAUTH2_TOKEN_CACHE: {} as KVNamespace,
    OAUTH2_TOKEN_REFRESHERS: {} as DurableObjectNamespace,
    AI: {} as Ai,
  };
}
