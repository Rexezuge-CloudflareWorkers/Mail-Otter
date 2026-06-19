import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetByIdForUser } = vi.hoisted(() => ({
  mockGetByIdForUser: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return { getByIdForUser: mockGetByIdForUser };
  }),
}));

vi.mock('@mail-otter/provider-clients/gmail', () => ({
  GmailProviderUtil: {
    listLabels: vi.fn(),
  },
}));

vi.mock('@mail-otter/provider-clients/outlook', () => ({
  OutlookProviderUtil: {
    listMailFolders: vi.fn(),
  },
}));

vi.mock('../../packages/backend-services/src/oauth2/OAuth2AccessTokenService', () => ({
  OAuth2AccessTokenService: {
    getAccessToken: vi.fn(() => 'access-token'),
  },
}));

import { FolderService } from '../../packages/backend-services/src/application/FolderService';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';

function makeEnv() {
  return {
    DB: {} as D1Database,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('key') },
    OAUTH2_TOKEN_CACHE: {} as KVNamespace,
    OAUTH2_TOKEN_REFRESHERS: {} as DurableObjectNamespace,
  };
}

describe('FolderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists Gmail labels', async () => {
    mockGetByIdForUser.mockResolvedValue({
      applicationId: 'app-1',
      providerId: 'google-gmail',
      credentials: { clientId: 'cid' },
    });
    (GmailProviderUtil.listLabels as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'INBOX', name: 'Inbox' },
      { id: 'IMPORTANT', name: 'Important' },
    ]);

    const result = await FolderService.listFolders('user@example.com', 'app-1', makeEnv());

    expect(result).toEqual([
      { id: 'INBOX', name: 'Inbox' },
      { id: 'IMPORTANT', name: 'Important' },
    ]);
  });

  it('lists Outlook mail folders', async () => {
    mockGetByIdForUser.mockResolvedValue({
      applicationId: 'app-1',
      providerId: 'microsoft-outlook',
      credentials: { clientId: 'cid' },
    });
    (OutlookProviderUtil.listMailFolders as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'inbox-folder', displayName: 'Inbox' },
      { id: 'sent-folder', displayName: 'Sent Items' },
    ]);

    const result = await FolderService.listFolders('user@example.com', 'app-1', makeEnv());

    expect(result).toEqual([
      { id: 'inbox-folder', name: 'Inbox' },
      { id: 'sent-folder', name: 'Sent Items' },
    ]);
  });

  it('throws when application not found', async () => {
    mockGetByIdForUser.mockResolvedValue(undefined);

    await expect(
      FolderService.listFolders('user@example.com', 'nonexistent', makeEnv()),
    ).rejects.toThrow('Connected application was not found.');
  });

  it('throws for unsupported provider', async () => {
    mockGetByIdForUser.mockResolvedValue({
      applicationId: 'app-1',
      providerId: 'unknown',
      credentials: { clientId: 'cid' },
    });

    await expect(
      FolderService.listFolders('user@example.com', 'app-1', makeEnv()),
    ).rejects.toThrow('Unsupported provider.');
  });
});
