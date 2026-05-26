import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTION_METHOD_OAUTH2,
  PROVIDER_MICROSOFT_OUTLOOK,
  PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
} from '@mail-otter/shared/constants';
import type { ConnectedApplication, ProviderSubscription } from '@mail-otter/shared/model';
import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-core/dao';
import { OAuth2AccessTokenService, OutlookProviderUtil, SubscriptionRenewalUtil } from '@mail-otter/backend-core/utils';

describe('SubscriptionRenewalUtil', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

    vi.spyOn(ProviderSubscriptionDAO.prototype, 'listActiveRenewalCandidates').mockImplementation(listActiveRenewalCandidates);
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'upsertActive').mockImplementation(upsertActive);
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'markError').mockResolvedValue(undefined);
    vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockImplementation(getById);
    vi.spyOn(ConnectedApplicationDAO.prototype, 'updateOAuth2RefreshToken').mockResolvedValue(undefined);
    vi.spyOn(OAuth2AccessTokenService, 'getAccessToken').mockResolvedValue('access-token');
    vi.spyOn(OutlookProviderUtil, 'renewSubscription').mockResolvedValue({
      id: 'renewed-subscription-id',
      resource: "/me/mailFolders('Inbox')/messages",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    await SubscriptionRenewalUtil.renewDueSubscriptions({
      DB: {} as D1Database,
      AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master-key') } as unknown as SecretsStoreSecret,
      OAUTH2_TOKEN_CACHE: {} as KVNamespace,
      OAUTH2_TOKEN_REFRESHERS: {} as DurableObjectNamespace,
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
