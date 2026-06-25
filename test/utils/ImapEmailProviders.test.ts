import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GmailImapEmailProvider } from '@mail-otter/backend-services/provider/GmailImapEmailProvider';
import { OutlookImapEmailProvider } from '@mail-otter/backend-services/provider/OutlookImapEmailProvider';
import { FastmailImapEmailProvider } from '@mail-otter/backend-services/provider/FastmailImapEmailProvider';

const { mockConnect, mockClose, mockSearchUidsSince, mockFetchHeaders } = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockClose: vi.fn().mockResolvedValue(undefined),
  mockSearchUidsSince: vi.fn().mockResolvedValue([]),
  mockFetchHeaders: vi.fn().mockResolvedValue([]),
}));

vi.mock('@mail-otter/provider-clients/imap', () => ({
  ImapClient: class {
    connect = mockConnect;
    close = mockClose;
    searchUidsSince = mockSearchUidsSince;
    fetchHeaders = mockFetchHeaders;
  },
}));

const IMAP_PASSWORD_CREDS = {
  type: 'imap-password' as const,
  username: 'user@example.com',
  password: 'app-password',
  host: '',
  port: 993,
};

const OAUTH2_CREDS = {
  type: 'oauth2' as const,
  accessToken: 'token',
};

describe.each([
  { name: 'GmailImapEmailProvider', Provider: GmailImapEmailProvider, expectedHost: 'imap.gmail.com', providerId: 'google-gmail' },
  { name: 'OutlookImapEmailProvider', Provider: OutlookImapEmailProvider, expectedHost: 'outlook.office365.com', providerId: 'microsoft-outlook' },
  { name: 'FastmailImapEmailProvider', Provider: FastmailImapEmailProvider, expectedHost: 'imap.fastmail.com', providerId: 'fastmail-jmap' },
])('$name', ({ Provider, expectedHost, providerId }) => {
  let provider: InstanceType<typeof Provider>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockSearchUidsSince.mockResolvedValue([]);
    mockFetchHeaders.mockResolvedValue([]);
    provider = new Provider();
  });

  it('has the correct providerId', () => {
    expect(provider.providerId).toBe(providerId);
  });

  it('does not support webhooks', () => {
    expect(provider.supportsWebhooks).toBe(false);
  });

  it('startWatch connects to hardcoded host and returns imap-cursor', async () => {
    const result = await provider.startWatch(IMAP_PASSWORD_CREDS, { baseUrl: 'https://example.com' });
    expect(result).toEqual({ type: 'imap-cursor', imapCursor: '0' });
    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({ host: expectedHost, port: 993 }),
    );
  });

  it('startWatch ignores host in credentials and always uses hardcoded host', async () => {
    const creds = { ...IMAP_PASSWORD_CREDS, host: 'custom.host.com', port: 1234 };
    await provider.startWatch(creds, { baseUrl: '' });
    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({ host: expectedHost, port: 993 }),
    );
  });

  it('startWatch throws when given oauth2 credentials', async () => {
    await expect(provider.startWatch(OAUTH2_CREDS, { baseUrl: '' })).rejects.toThrow();
  });

  it('pollNewMessages returns empty result when no new messages', async () => {
    const result = await provider.pollNewMessages(IMAP_PASSWORD_CREDS, '5');
    expect(result).toEqual({ messages: [], newCursor: '5' });
  });

  it('renewWatch returns imap-cursor without connecting', async () => {
    const result = await provider.renewWatch(IMAP_PASSWORD_CREDS, 'sub-id', null);
    expect(result).toEqual({ type: 'imap-cursor', imapCursor: '0' });
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('listFolders returns only INBOX', async () => {
    const folders = await provider.listFolders('token');
    expect(folders).toEqual([{ id: 'INBOX', name: 'Inbox' }]);
  });

  it('createCalendarEvent throws unsupported error', async () => {
    await expect(provider.createCalendarEvent('token', {})).rejects.toThrow();
  });

  it('createDraftReply throws unsupported error', async () => {
    await expect(provider.createDraftReply('token', 'msg-id', 'from@example.com', {})).rejects.toThrow();
  });
});
