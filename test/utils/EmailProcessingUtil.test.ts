import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailProcessingUtil } from '@/utils/EmailProcessingUtil';
import { ConnectedApplicationDAO, ProcessedMessageDAO } from '@/dao';
import { OAuth2ProviderUtil } from '@/utils/OAuth2ProviderUtil';
import { OutlookProviderUtil } from '@/utils/OutlookProviderUtil';

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
    vi.spyOn(OAuth2ProviderUtil, 'refreshAccessToken').mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: undefined,
    });
    const tryStart = vi.spyOn(ProcessedMessageDAO.prototype, 'tryStart').mockResolvedValue(true);
    const markSkipped = vi.spyOn(ProcessedMessageDAO.prototype, 'markSkipped').mockResolvedValue();
    const markError = vi.spyOn(ProcessedMessageDAO.prototype, 'markError').mockResolvedValue();
    vi.spyOn(OutlookProviderUtil, 'getMessage').mockRejectedValue(
      new Error(
        'Microsoft Graph API error: The specified object was not found in the store., The process failed to get the correct properties.',
      ),
    );

    await expect(
      EmailProcessingUtil.processQueueMessage(
        {
          type: 'outlook-notification',
          applicationId: 'app-1',
          subscriptionId: 'subscription-1',
          messageId: 'message-1',
        } as never,
        {
          DB: {} as D1Database,
          AES_ENCRYPTION_KEY_SECRET: {
            get: vi.fn().mockResolvedValue('master-key'),
          } as never,
          AI: {} as Ai,
        },
      ),
    ).resolves.toBeUndefined();

    expect(tryStart).toHaveBeenCalledWith('app-1', 'microsoft-outlook', 'message-1', null);
    expect(markSkipped).toHaveBeenCalledWith('app-1', 'message-1', 'Outlook message was deleted before Mail-Otter could process it.');
    expect(markError).not.toHaveBeenCalled();
  });
});
