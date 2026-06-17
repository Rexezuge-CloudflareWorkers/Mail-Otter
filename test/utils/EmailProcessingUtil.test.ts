import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailProcessingUtil, EmailSummaryUtil } from '@mail-otter/backend-services/email';
import type { EmailProcessingEnv } from '@mail-otter/backend-services/email';
import { AiDailyUsageDAO, ConnectedApplicationDAO, ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import type { OutlookMessage } from '@mail-otter/provider-clients/outlook';
import { AiSummaryRetryableError, NonRetryableError, RetryableError } from '@mail-otter/backend-errors';

describe('EmailProcessingUtil', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ProcessedMessageDAO.prototype, 'getByMessageId').mockResolvedValue(createProcessedMessage());
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
      const summarizeEmail = vi.spyOn(EmailSummaryUtil, 'summarizeEmailWithUsage').mockResolvedValue({ summary: 'Summary text' });
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
      const summarizeEmail = vi.spyOn(EmailSummaryUtil, 'summarizeEmailWithUsage').mockResolvedValue({ summary: 'Summary text' });
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
      expect(sendSelfSummaryReply).toHaveBeenCalledWith('access-token', expect.anything(), 'owner@example.com', 'Summary text\n\n<p><em>Powered by Mail-Otter</em></p>', false);
      expect(markSummarized).toHaveBeenCalledWith('app-1', 'reply-message-2');
    });

    it('appends metadata-only debug details when DEBUG_MODE is true', async () => {
      vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
      vi.spyOn(ProcessedMessageDAO.prototype, 'markSummarized').mockResolvedValue();
      vi.spyOn(ProcessedMessageDAO.prototype, 'markError').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'getMessage').mockResolvedValue(createOutlookMessage());
      const sendSelfSummaryReply = vi.spyOn(OutlookProviderUtil, 'sendSelfSummaryReply').mockResolvedValue();
      vi.spyOn(AiDailyUsageDAO.prototype, 'incrementUsage').mockResolvedValue();
      vi.spyOn(EmailSummaryUtil, 'summarizeEmailWithUsage').mockResolvedValue({
        summary: 'Summary text',
        usage: { promptTokens: 1000, completionTokens: 100, totalTokens: 1100 },
      });

      await EmailProcessingUtil.processOutlookMessage(
        createApplication(),
        'access-token',
        'message-1',
        createEnv({ DEBUG_MODE: 'true' }),
        [],
      );

      const summary: string = sendSelfSummaryReply.mock.calls[0]![3];
      expect(summary).toContain('<hr>');
      expect(summary).toContain('<pre style="font-size:11px;color:#666;white-space:pre-wrap;">');
      expect(summary).toContain('--- Debug Informations ---');
      expect(summary).toContain('Provider: microsoft-outlook');
      expect(summary).toContain('Application: app-1 (app-1)');
      expect(summary).toContain('Model: @cf/openai/gpt-oss-120b');
      expect(summary).toContain('Input chars: 33 / 12000');
      expect(summary).toContain('RAG context: not used');
      expect(summary).toContain('AI usage: prompt=1000 completion=100 total=1100 estimatedNeurons=39');
      expect(summary).not.toContain('Please review the project update.');
      expect(summary).not.toContain('access-token');
    });

    it('uses the primary summary model while the daily neuron estimate is below the fallback threshold', async () => {
      vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
      vi.spyOn(ProcessedMessageDAO.prototype, 'markSummarized').mockResolvedValue();
      vi.spyOn(ProcessedMessageDAO.prototype, 'markError').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'sendSelfSummaryReply').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'getMessage').mockResolvedValue(createOutlookMessage());
      vi.spyOn(AiDailyUsageDAO.prototype, 'getEstimatedNeuronsForDate').mockResolvedValue(5000);
      const incrementUsage = vi.spyOn(AiDailyUsageDAO.prototype, 'incrementUsage').mockResolvedValue();
      const summarizeEmail = vi.spyOn(EmailSummaryUtil, 'summarizeEmailWithUsage').mockResolvedValue({
        summary: 'Summary text',
        usage: { promptTokens: 1000, completionTokens: 100 },
      });

      await EmailProcessingUtil.processOutlookMessage(
        createApplication(),
        'access-token',
        'message-1',
        createEnv({ AI_DAILY_NEURON_FALLBACK_THRESHOLD: '6000' }),
        [],
      );

      expect(summarizeEmail).toHaveBeenCalledWith(
        expect.anything(),
        '@cf/openai/gpt-oss-120b',
        'Project update',
        'sender@example.com',
        'Please review the project update.',
        undefined,
      );
      expect(incrementUsage).toHaveBeenCalledWith({
        usageDate: expect.any(String),
        estimatedNeurons: 39,
        promptTokens: 1000,
        completionTokens: 100,
      });
    });

    it('uses the fallback summary model after the daily neuron estimate reaches the threshold', async () => {
      vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
      vi.spyOn(ProcessedMessageDAO.prototype, 'markSummarized').mockResolvedValue();
      vi.spyOn(ProcessedMessageDAO.prototype, 'markError').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'sendSelfSummaryReply').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'getMessage').mockResolvedValue(createOutlookMessage());
      vi.spyOn(AiDailyUsageDAO.prototype, 'getEstimatedNeuronsForDate').mockResolvedValue(6000);
      const incrementUsage = vi.spyOn(AiDailyUsageDAO.prototype, 'incrementUsage').mockResolvedValue();
      const summarizeEmail = vi.spyOn(EmailSummaryUtil, 'summarizeEmailWithUsage').mockResolvedValue({
        summary: 'Summary text',
        usage: { promptTokens: 1000, completionTokens: 100 },
      });

      await EmailProcessingUtil.processOutlookMessage(
        createApplication(),
        'access-token',
        'message-1',
        createEnv({ AI_DAILY_NEURON_FALLBACK_THRESHOLD: '6000' }),
        [],
      );

      expect(summarizeEmail).toHaveBeenCalledWith(
        expect.anything(),
        '@cf/openai/gpt-oss-20b',
        'Project update',
        'sender@example.com',
        'Please review the project update.',
        undefined,
      );
      expect(incrementUsage).toHaveBeenCalledWith({
        usageDate: expect.any(String),
        estimatedNeurons: 21,
        promptTokens: 1000,
        completionTokens: 100,
      });
    });

    it('records failed primary summary usage before retrying with the fallback model', async () => {
      vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
      vi.spyOn(ProcessedMessageDAO.prototype, 'markSummarized').mockResolvedValue();
      vi.spyOn(ProcessedMessageDAO.prototype, 'markError').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'sendSelfSummaryReply').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'getMessage').mockResolvedValue(createOutlookMessage());
      const incrementUsage = vi.spyOn(AiDailyUsageDAO.prototype, 'incrementUsage').mockResolvedValue();
      const summarizeEmail = vi
        .spyOn(EmailSummaryUtil, 'summarizeEmailWithUsage')
        .mockRejectedValueOnce(
          new AiSummaryRetryableError('Workers AI did not return a valid summary.', {
            aiUsage: { promptTokens: 1000, completionTokens: 700, totalTokens: 1700 },
            aiOutputText: '{"wrong":true}',
          }),
        )
        .mockResolvedValueOnce({
          summary: 'Summary text',
          usage: { promptTokens: 500, completionTokens: 50 },
        });

      await EmailProcessingUtil.processOutlookMessage(createApplication(), 'access-token', 'message-1', createEnv(), []);

      expect(summarizeEmail).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        '@cf/openai/gpt-oss-120b',
        'Project update',
        'sender@example.com',
        'Please review the project update.',
        undefined,
      );
      expect(summarizeEmail).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        '@cf/openai/gpt-oss-20b',
        'Project update',
        'sender@example.com',
        'Please review the project update.',
        undefined,
      );
      expect(incrementUsage).toHaveBeenNthCalledWith(1, {
        usageDate: expect.any(String),
        estimatedNeurons: 80,
        promptTokens: 1000,
        completionTokens: 700,
      });
      expect(incrementUsage).toHaveBeenNthCalledWith(2, {
        usageDate: expect.any(String),
        estimatedNeurons: 11,
        promptTokens: 500,
        completionTokens: 50,
      });
    });

    it('classifies Workers AI 4006 free allocation exhaustion as non-retryable', async () => {
      vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
      const markError = vi.spyOn(ProcessedMessageDAO.prototype, 'markError').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'getMessage').mockResolvedValue(createOutlookMessage());
      vi.spyOn(EmailSummaryUtil, 'summarizeEmailWithUsage').mockRejectedValue(
        new Error(
          "4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage.",
        ),
      );

      await expect(
        EmailProcessingUtil.processOutlookMessage(createApplication(), 'access-token', 'message-1', createEnv(), []),
      ).rejects.toThrow(NonRetryableError);

      expect(markError).toHaveBeenCalledWith('app-1', 'message-1', 'Workers AI daily free allocation was exceeded.');
    });

    it('classifies nested Workers AI free allocation payloads as non-retryable', async () => {
      vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
      const markError = vi.spyOn(ProcessedMessageDAO.prototype, 'markError').mockResolvedValue();
      vi.spyOn(OutlookProviderUtil, 'getMessage').mockResolvedValue(createOutlookMessage());
      vi.spyOn(EmailSummaryUtil, 'summarizeEmailWithUsage').mockRejectedValue({
        errors: [
          {
            code: 4006,
            message: "you have used up your daily free allocation of 10,000 neurons",
          },
        ],
      });

      await expect(
        EmailProcessingUtil.processOutlookMessage(createApplication(), 'access-token', 'message-1', createEnv(), []),
      ).rejects.toThrow(NonRetryableError);

      expect(markError).toHaveBeenCalledWith('app-1', 'message-1', 'Workers AI daily free allocation was exceeded.');
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

function createProcessedMessage() {
  return {
    processedMessageId: 'processed-message-1',
    applicationId: 'app-1',
    providerId: 'microsoft-outlook',
    providerMessageId: 'message-1',
    providerThreadId: 'conversation-1',
    status: 'processing',
    createdAt: 1778200000,
    updatedAt: 1778200000,
  } as never;
}

function createEnv(overrides: Partial<EmailProcessingEnv> = {}): EmailProcessingEnv {
  return {
    DB: {} as D1Database,
    AES_ENCRYPTION_KEY_SECRET: {
      get: vi.fn().mockResolvedValue('master-key'),
    } as never,
    OAUTH2_TOKEN_CACHE: {} as KVNamespace,
    OAUTH2_TOKEN_REFRESHERS: {} as DurableObjectNamespace,
    ACTION_ENCRYPTION_KEY_SECRET: {
      get: vi.fn().mockResolvedValue('action-master-key'),
    } as never,
    ACTION_SIGNING_SECRET: {
      get: vi.fn().mockResolvedValue('action-signing-secret'),
    } as never,
    AI: {} as Ai,
    AI_DAILY_NEURON_FALLBACK_THRESHOLD: '0',
    ...overrides,
  };
}
