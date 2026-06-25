import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTION_METHOD_OAUTH2,
  PROVIDER_MICROSOFT_OUTLOOK,
  PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
} from '@mail-otter/shared/constants';
import type { ConnectedApplication, ProviderSubscription } from '@mail-otter/shared/model';
import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import { OAuth2AccessTokenService } from '@mail-otter/backend-services/oauth2';
import { SubscriptionRenewalUtil } from '@mail-otter/backend-services/subscription';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import { ProviderApiRetryableError } from '@mail-otter/backend-errors';

const makeSubscription = (overrides: Partial<ProviderSubscription> = {}): ProviderSubscription => ({
  subscriptionId: 'subscription-id',
  applicationId: 'application-id',
  providerId: PROVIDER_MICROSOFT_OUTLOOK,
  externalSubscriptionId: 'graph-subscription-id',
  clientStateHash: 'client-state-hash',
  resource: "/me/mailFolders('Inbox')/messages",
  status: PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
  expiresAt: Math.floor(Date.now() / 1000),
  renewalRetryCount: 0,
  renewalNextRetryAt: null,
  createdAt: Math.floor(Date.now() / 1000),
  updatedAt: Math.floor(Date.now() / 1000),
  ...overrides,
});

const makeApplication = (): ConnectedApplication => ({
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
});

const makeEnv = () => ({
  DB: {} as D1Database,
  AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master-key') } as unknown as SecretsStoreSecret,
  OAUTH2_TOKEN_CACHE: {} as KVNamespace,
  OAUTH2_TOKEN_REFRESHERS: {} as DurableObjectNamespace,
});

describe('SubscriptionRenewalUtil', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renews due Outlook subscriptions without PUBLIC_BASE_URL', async () => {
    const subscription = makeSubscription();
    const upsertActive = vi.fn().mockResolvedValue(subscription);

    vi.spyOn(ProviderSubscriptionDAO.prototype, 'listActiveRenewalCandidates').mockResolvedValue([subscription]);
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'upsertActive').mockImplementation(upsertActive);
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'markError').mockResolvedValue(undefined);
    vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue(makeApplication());
    vi.spyOn(ConnectedApplicationDAO.prototype, 'updateOAuth2RefreshToken').mockResolvedValue(undefined);
    vi.spyOn(OAuth2AccessTokenService.prototype, 'getAccessToken').mockResolvedValue('access-token');
    vi.spyOn(OutlookProviderUtil, 'renewSubscription').mockResolvedValue({
      id: 'renewed-subscription-id',
      resource: "/me/mailFolders('Inbox')/messages",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    await new SubscriptionRenewalUtil(makeEnv()).renewDueSubscriptions();

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

  it('records transient error with exponential backoff on retryable renewal failure', async () => {
    const now = Math.floor(Date.now() / 1000);
    const subscription = makeSubscription({ renewalRetryCount: 2 });
    const recordTransientError = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(ProviderSubscriptionDAO.prototype, 'listActiveRenewalCandidates').mockResolvedValue([subscription]);
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'recordTransientError').mockImplementation(recordTransientError);
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'markError').mockResolvedValue(undefined);
    vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue(makeApplication());
    vi.spyOn(ConnectedApplicationDAO.prototype, 'updateOAuth2RefreshToken').mockResolvedValue(undefined);
    vi.spyOn(OAuth2AccessTokenService.prototype, 'getAccessToken').mockResolvedValue('access-token');
    vi.spyOn(OutlookProviderUtil, 'renewSubscription').mockRejectedValue(new ProviderApiRetryableError('Service unavailable'));

    await new SubscriptionRenewalUtil(makeEnv()).renewDueSubscriptions();

    expect(recordTransientError).toHaveBeenCalledWith(
      'subscription-id',
      expect.any(String),
      expect.any(Number),
    );
    // retry_count=2 → delay = 300 * 2^2 = 1200s; nextRetryAt should be > now
    const nextRetryAt = (recordTransientError.mock.calls[0] as [string, string, number])[2];
    expect(nextRetryAt).toBeGreaterThan(now);
    expect(nextRetryAt).toBeLessThanOrEqual(now + 14_400);
    expect(ProviderSubscriptionDAO.prototype.markError).not.toHaveBeenCalled();
  });
});
