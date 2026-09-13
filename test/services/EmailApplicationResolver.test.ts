import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  listContextEnabledApplicationIdsByUserEmail: vi.fn().mockResolvedValue([]),
  getAccessToken: vi.fn().mockResolvedValue('token'),
  getByApplication: vi.fn(),
  listMessageIdsSince: vi.fn(),
  updateGmailHistory: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ConnectedApplicationDAO: class {
    getById = mocks.getById;
    listContextEnabledApplicationIdsByUserEmail = mocks.listContextEnabledApplicationIdsByUserEmail;
  },
  ProviderSubscriptionDAO: class {
    getByApplication = mocks.getByApplication;
    updateGmailHistory = mocks.updateGmailHistory;
  },
}));

vi.mock('@mail-otter/backend-services/oauth2/OAuth2AccessTokenService', () => ({
  OAuth2AccessTokenService: class {
    getAccessToken = mocks.getAccessToken;
  },
}));

vi.mock('@mail-otter/provider-clients/gmail', () => ({
  GmailProviderUtil: { listMessageIdsSince: mocks.listMessageIdsSince },
}));

import { EmailApplicationResolver } from '@mail-otter/backend-services/email/processing/EmailApplicationResolver';

function env() {
  return {
    DB: {},
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master') },
  } as never;
}

describe('EmailApplicationResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listContextEnabledApplicationIdsByUserEmail.mockResolvedValue([]);
    mocks.getAccessToken.mockResolvedValue('token');
  });

  it('throws for missing applications', async () => {
    mocks.getById.mockResolvedValue(undefined);
    await expect(
      new EmailApplicationResolver(env()).resolveApplication({ applicationId: 'missing' } as never),
    ).rejects.toThrow('Connected application was not found');
  });

  it('throws for applications without a provider mailbox', async () => {
    mocks.getById.mockResolvedValue({ applicationId: 'a', providerEmail: null, userEmail: 'u@x' });
    await expect(
      new EmailApplicationResolver(env()).resolveApplication({ applicationId: 'a' } as never),
    ).rejects.toThrow('provider mailbox');
  });

  it('resolves imap-password apps without a token fetch', async () => {
    mocks.getById.mockResolvedValue({
      applicationId: 'a',
      providerEmail: 'u@gmail.com',
      userEmail: 'u@x',
      connectionMethod: 'imap-password',
    });
    const resolved = await new EmailApplicationResolver(env()).resolveApplication({ applicationId: 'a' } as never);
    expect(resolved.accessToken).toBe('');
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
  });

  it('returns null for inactive gmail subscriptions and updates history', async () => {
    mocks.getByApplication.mockResolvedValue({ status: 'inactive' });
    const result = await new EmailApplicationResolver(env()).listGmailMessages(
      { applicationId: 'a' } as never,
      'tok',
      'hist-1',
    );
    expect(result).toBeNull();
    await new EmailApplicationResolver(env()).updateGmailHistory('sub-1', 'hist-2');
    expect(mocks.updateGmailHistory).toHaveBeenCalledWith('sub-1', 'hist-2');
  });

  it('lists gmail messages for active subscriptions', async () => {
    mocks.getByApplication.mockResolvedValue({ status: 'active', subscriptionId: 'sub-1', gmailHistoryId: null });
    mocks.listMessageIdsSince.mockResolvedValue({ messageIds: ['m1'], historyId: 'hist-9' });
    const result = await new EmailApplicationResolver(env()).listGmailMessages(
      { applicationId: 'a', watchedFolders: [{ id: 'INBOX' }] } as never,
      'tok',
      'hist-1',
    );
    expect(result).toEqual({ messageIds: ['m1'], historyId: 'hist-9', subscriptionId: 'sub-1' });
  });
});
