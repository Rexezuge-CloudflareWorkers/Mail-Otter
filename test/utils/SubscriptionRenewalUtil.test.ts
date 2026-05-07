import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTION_METHOD_OAUTH2,
  PROVIDER_MICROSOFT_OUTLOOK,
  PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
} from '@mail-otter/shared/constants';
import type { ConnectedApplication, ProviderSubscription } from '@mail-otter/shared/model';
import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@/dao';
import { OAuth2ProviderUtil, OutlookProviderUtil, SubscriptionRenewalUtil } from '@/utils';

vi.mock('@/dao', () => ({
  ConnectedApplicationDAO: vi.fn(),
  ProviderSubscriptionDAO: vi.fn(),
}));

vi.mock('@/utils/OAuth2ProviderUtil', () => ({
  OAuth2ProviderUtil: {
    refreshAccessToken: vi.fn(),
  },
}));

vi.mock('@/utils/OutlookProviderUtil', () => ({
  OutlookProviderUtil: {
    renewSubscription: vi.fn(),
  },
}));

describe('SubscriptionRenewalUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renews due Outlook subscriptions without PUBLIC_BASE_URL', async () => {
    const subscription: ProviderSubscription = {
      subscriptionId: 'subscription-id',
      applicationId: 'application-id',
      providerId: PROVIDER_MICROSOFT_OUTLOOK,
      externalSubscriptionId: 'graph-subscription-id',
      clientStateHash: 'client-state-hash',
      resource: "/me/mailFolders('Inbox')/messages",
      status: PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
      expiresAt: Math.floor(Date.now() / 1000),
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    };
    const application: ConnectedApplication = {
      applicationId: 'application-id',
      userEmail: 'user@example.com',
      displayName: 'Outlook',
      providerId: PROVIDER_MICROSOFT_OUTLOOK,
      connectionMethod: CONNECTION_METHOD_OAUTH2,
      credentials: { clientId: 'client-id', clientSecret: 'client-secret', refreshToken: 'refresh-token' },
      status: CONNECTED_APPLICATION_STATUS_CONNECTED,
      contextIndexingEnabled: false,
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    };
    const listActiveRenewalCandidates = vi.fn().mockResolvedValue([subscription]);
    const upsertActive = vi.fn().mockResolvedValue(subscription);
    const getById = vi.fn().mockResolvedValue(application);

    vi.mocked(ProviderSubscriptionDAO).mockImplementation(function () {
      return {
        listActiveRenewalCandidates,
        upsertActive,
        markError: vi.fn(),
      } as unknown as ProviderSubscriptionDAO;
    });
    vi.mocked(ConnectedApplicationDAO).mockImplementation(function () {
      return {
        getById,
        updateOAuth2RefreshToken: vi.fn(),
      } as unknown as ConnectedApplicationDAO;
    });
    vi.mocked(OAuth2ProviderUtil.refreshAccessToken).mockResolvedValue({ accessToken: 'access-token' });
    vi.mocked(OutlookProviderUtil.renewSubscription).mockResolvedValue({
      id: 'renewed-subscription-id',
      resource: "/me/mailFolders('Inbox')/messages",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    await SubscriptionRenewalUtil.renewDueSubscriptions({
      DB: {} as D1Database,
      AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master-key') } as unknown as SecretsStoreSecret,
    });

    expect(OutlookProviderUtil.renewSubscription).toHaveBeenCalledWith('access-token', 'graph-subscription-id', expect.any(Number));
    expect(upsertActive).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'application-id',
        providerId: PROVIDER_MICROSOFT_OUTLOOK,
        externalSubscriptionId: 'renewed-subscription-id',
        resource: "/me/mailFolders('Inbox')/messages",
      }),
    );
  });
});
