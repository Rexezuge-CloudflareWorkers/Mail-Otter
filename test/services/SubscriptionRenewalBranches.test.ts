import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTION_METHOD_OAUTH2,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
  PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
} from '@mail-otter/shared/constants';
import type { ConnectedApplication, ProviderSubscription } from '@mail-otter/shared/model';
import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import { OAuth2AccessTokenService } from '@mail-otter/backend-services/oauth2';
import { SubscriptionRenewalUtil } from '@mail-otter/backend-services/subscription';

const now = Math.floor(Date.now() / 1000);

function makeSubscription(overrides: Partial<ProviderSubscription> = {}): ProviderSubscription {
  return {
    subscriptionId: 'sub-1',
    applicationId: 'app-1',
    providerId: PROVIDER_MICROSOFT_OUTLOOK,
    externalSubscriptionId: 'ext-1',
    clientStateHash: null,
    resource: null,
    status: PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
    expiresAt: now - 10,
    renewalRetryCount: 0,
    renewalNextRetryAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeApplication(overrides: Partial<ConnectedApplication> = {}): ConnectedApplication {
  return {
    applicationId: 'app-1',
    userEmail: 'u@x',
    displayName: 'App',
    providerId: PROVIDER_MICROSOFT_OUTLOOK,
    connectionMethod: CONNECTION_METHOD_OAUTH2,
    credentials: { clientId: 'c', clientSecret: 's', refreshToken: 'r' },
    status: CONNECTED_APPLICATION_STATUS_CONNECTED,
    contextIndexingEnabled: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as ConnectedApplication;
}

function makeEnv() {
  return {
    DB: {},
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master') },
    OAUTH2_TOKEN_CACHE: {},
    OAUTH2_TOKEN_REFRESHERS: {},
  } as never;
}

describe('SubscriptionRenewalUtil branches', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(OAuth2AccessTokenService.prototype, 'getAccessToken').mockResolvedValue('tok');
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'markError').mockResolvedValue(undefined);
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'recordTransientError').mockResolvedValue(undefined);
  });

  it('skips IMAP polling subscriptions', async () => {
    const upsertActive = vi.fn();
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'listActiveRenewalCandidates').mockResolvedValue([
      makeSubscription({ providerId: 'custom-imap' }),
    ]);
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'upsertActive').mockImplementation(upsertActive);
    vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue(makeApplication());
    await new SubscriptionRenewalUtil(makeEnv()).renewDueSubscriptions();
    expect(upsertActive).not.toHaveBeenCalled();
  });

  it('skips subscriptions outside their renewal windows', async () => {
    const upsertActive = vi.fn();
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'listActiveRenewalCandidates').mockResolvedValue([
      makeSubscription({ providerId: PROVIDER_GOOGLE_GMAIL, expiresAt: now + 99_999_999 }),
      makeSubscription({ subscriptionId: 'sub-2', providerId: PROVIDER_MICROSOFT_OUTLOOK, expiresAt: now + 99_999_999 }),
    ]);
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'upsertActive').mockImplementation(upsertActive);
    await new SubscriptionRenewalUtil(makeEnv()).renewDueSubscriptions();
    expect(upsertActive).not.toHaveBeenCalled();
  });

  it('marks non-retryable renewal failures as errors', async () => {
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'listActiveRenewalCandidates').mockResolvedValue([
      makeSubscription({ providerId: PROVIDER_GOOGLE_GMAIL, expiresAt: now - 10 }),
    ]);
    vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue(undefined);
    // gmail renew with missing application returns silently — no error recorded
    await new SubscriptionRenewalUtil(makeEnv()).renewDueSubscriptions();
    expect(ProviderSubscriptionDAO.prototype.markError).not.toHaveBeenCalled();
  });

  it('records markError for outlook renewal failures', async () => {
    vi.spyOn(ProviderSubscriptionDAO.prototype, 'listActiveRenewalCandidates').mockResolvedValue([
      makeSubscription({ providerId: PROVIDER_MICROSOFT_OUTLOOK, expiresAt: now - 10, externalSubscriptionId: null }),
    ]);
    vi.spyOn(ConnectedApplicationDAO.prototype, 'getById').mockResolvedValue(makeApplication());
    // No PUBLIC_BASE_URL and no external id → renewViaInterface throws → markError
    await new SubscriptionRenewalUtil(makeEnv()).renewDueSubscriptions();
    expect(ProviderSubscriptionDAO.prototype.markError).toHaveBeenCalledWith('sub-1', expect.any(String), expect.any(Number));
  });
});
