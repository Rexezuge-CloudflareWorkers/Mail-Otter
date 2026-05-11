import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailProcessingUtil } from '@/utils/EmailProcessingUtil';
import type { EmailProcessingEnv } from '@/utils/EmailProcessingUtil';
import { ConnectedApplicationDAO, ProcessedMessageDAO } from '@/dao';
import { OAuth2AccessTokenService } from '@/utils/OAuth2AccessTokenService';
import { OutlookProviderUtil } from '@/utils/OutlookProviderUtil';
import { NonRetryableError, RetryableError } from '@/error';

describe('EmailProcessingUtil', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('marks Outlook messages as skipped when they are deleted before processing', async () => {
    vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue({
      applicationId: 'app-1',
      userEmail: 'owner@example.com',
      providerId: 'microsoft-outlook',
      providerEmail: 'owner@example.com',
      credentials: { refreshToken: 'refresh-token' },
    } as never);
    vi.spyOn(ConnectedApplicationDAO.prototype, 'listContextEnabledApplicationIdsByUserEmail').mockResolvedValue([]);
    vi.spyOn(OAuth2AccessTokenService, 'getAccessToken').mockResolvedValue('access-token');
    const tryStart = vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
    const markSkipped = vi.spyOn(ProcessedMessageDAO.prototype, 'markSkipped').mockResolvedValue();
    const markError = vi.spyOn(ProcessedMessageDAO.prototype, 'markError').mockResolvedValue();
    vi.spyOn(OutlookProviderUtil, 'getMessage').mockRejectedValue(
      new Error(
        'Microsoft Graph API error: The specified object was not found in the store., The process failed to get the correct properties.',
      ),
    );

    await expect(EmailProcessingUtil.processQueueMessage(createOutlookQueueMessage(), createEnv())).resolves.toBeUndefined();

    expect(tryStart).toHaveBeenCalledWith('app-1', 'microsoft-outlook', 'message-1', null, { allowExistingForRetry: false });
    expect(markSkipped).toHaveBeenCalledWith('app-1', 'message-1', 'Outlook message was deleted before Mail-Otter could process it.');
    expect(markError).not.toHaveBeenCalled();
  });

  it('allows workflow retry attempts to resume existing processed-message rows', async () => {
    vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue({
      applicationId: 'app-1',
      userEmail: 'owner@example.com',
      providerId: 'microsoft-outlook',
      providerEmail: 'owner@example.com',
      credentials: { refreshToken: 'refresh-token' },
    } as never);
    vi.spyOn(ConnectedApplicationDAO.prototype, 'listContextEnabledApplicationIdsByUserEmail').mockResolvedValue([]);
    vi.spyOn(OAuth2AccessTokenService, 'getAccessToken').mockResolvedValue('access-token');
    const tryStart = vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
    vi.spyOn(ProcessedMessageDAO.prototype, 'markSkipped').mockResolvedValue();
    vi.spyOn(OutlookProviderUtil, 'getMessage').mockRejectedValue(
      new Error(
        'Microsoft Graph API error: The specified object was not found in the store., The process failed to get the correct properties.',
      ),
    );

    await expect(
      EmailProcessingUtil.processQueueMessage(createOutlookQueueMessage(), createEnv(), { retryAttempt: 2 }),
    ).resolves.toBeUndefined();

    expect(tryStart).toHaveBeenCalledWith('app-1', 'microsoft-outlook', 'message-1', null, { allowExistingForRetry: true });
  });

  it('classifies missing applications as non-retryable', async () => {
    vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue(undefined);

    await expect(EmailProcessingUtil.processQueueMessage(createOutlookQueueMessage(), createEnv())).rejects.toThrow(NonRetryableError);
  });

  it('classifies unexpected processing failures as retryable and records the error', async () => {
    vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue({
      applicationId: 'app-1',
      userEmail: 'owner@example.com',
      providerId: 'microsoft-outlook',
      providerEmail: 'owner@example.com',
      credentials: { refreshToken: 'refresh-token' },
    } as never);
    vi.spyOn(ConnectedApplicationDAO.prototype, 'listContextEnabledApplicationIdsByUserEmail').mockResolvedValue([]);
    vi.spyOn(OAuth2AccessTokenService, 'getAccessToken').mockResolvedValue('access-token');
    vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
    const markError = vi.spyOn(ProcessedMessageDAO.prototype, 'markError').mockResolvedValue();
    vi.spyOn(OutlookProviderUtil, 'getMessage').mockRejectedValue(new Error('Temporary Graph failure.'));

    await expect(EmailProcessingUtil.processQueueMessage(createOutlookQueueMessage(), createEnv())).rejects.toThrow(RetryableError);

    expect(markError).toHaveBeenCalledWith('app-1', 'message-1', 'Temporary Graph failure.');
  });
});

function createOutlookQueueMessage() {
  return {
    type: 'outlook-notification',
    applicationId: 'app-1',
    subscriptionId: 'subscription-1',
    messageId: 'message-1',
  } as never;
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
