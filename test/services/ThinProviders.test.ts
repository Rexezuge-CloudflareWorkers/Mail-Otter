import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConnect, mockClose, mockSearchUids, mockFetchHeaders } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockClose: vi.fn(),
  mockSearchUids: vi.fn(),
  mockFetchHeaders: vi.fn(),
}));

vi.mock('@mail-otter/provider-clients/imap', () => ({
  ImapClient: vi.fn(function () {
    return {
      connect: mockConnect,
      close: mockClose,
      searchUidsSince: mockSearchUids,
      fetchHeaders: mockFetchHeaders,
    };
  }),
}));

const { mockGetProfile, mockListMailboxes, mockDeletePush, mockCreatePush, mockCreateCalendarEvent, mockCreateDraft } =
  vi.hoisted(() => ({
    mockGetProfile: vi.fn(),
    mockListMailboxes: vi.fn(),
    mockDeletePush: vi.fn(),
    mockCreatePush: vi.fn(),
    mockCreateCalendarEvent: vi.fn(),
    mockCreateDraft: vi.fn(),
  }));

vi.mock('@mail-otter/provider-clients/fastmail', () => ({
  FastmailProviderUtil: {
    getProfile: (...args: unknown[]) => mockGetProfile(...args),
    listMailboxes: (...args: unknown[]) => mockListMailboxes(...args),
    deletePushSubscription: (...args: unknown[]) => mockDeletePush(...args),
    createPushSubscription: (...args: unknown[]) => mockCreatePush(...args),
    createCalendarEvent: (...args: unknown[]) => mockCreateCalendarEvent(...args),
    createDraftReply: (...args: unknown[]) => mockCreateDraft(...args),
  },
}));

vi.mock('@mail-otter/provider-clients/webhook', () => ({
  WebhookSecurityUtil: {
    generateSecret: () => 'secret-1',
    hashSecret: async () => 'hash-1',
  },
}));

vi.mock('@mail-otter/provider-clients/yahoo', () => ({
  YahooProviderUtil: { getProfile: (...args: unknown[]) => mockGetProfile(...args) },
}));

import { YahooEmailProvider } from '../../packages/backend-services/src/provider/YahooEmailProvider';
import { CustomImapEmailProvider } from '../../packages/backend-services/src/provider/CustomImapEmailProvider';
import { FastmailEmailProvider } from '../../packages/backend-services/src/provider/FastmailEmailProvider';
import { GmailImapEmailProvider } from '../../packages/backend-services/src/provider/GmailImapEmailProvider';
import { OutlookImapEmailProvider } from '../../packages/backend-services/src/provider/OutlookImapEmailProvider';
import { FastmailImapEmailProvider } from '../../packages/backend-services/src/provider/FastmailImapEmailProvider';
import { AppleICloudEmailProvider } from '../../packages/backend-services/src/provider/AppleICloudEmailProvider';
import { BadRequestError } from '@mail-otter/backend-errors';

const oauth2 = { type: 'oauth2', accessToken: 'tok', imapUsername: 'user@yahoo.com' } as never;
const imapPassword = {
  type: 'imap-password',
  username: 'u',
  password: 'p',
  host: 'imap.example.com',
  port: 993,
} as never;

describe('YahooEmailProvider', () => {
  const provider = new YahooEmailProvider();

  it('exposes provider id without webhooks mismatch', () => {
    expect(provider.providerId).toBe('yahoo-mail');
    expect(provider.supportsWebhooks).toBe(false);
  });

  it('rejects non-OAuth2 IMAP setup', async () => {
    await expect(provider.startWatch(imapPassword, {} as never)).rejects.toThrow(BadRequestError);
  });

  it('delegates getProfile to YahooProviderUtil', async () => {
    mockGetProfile.mockResolvedValue({ email: 'user@yahoo.com' });
    await expect(provider.getProfile('tok')).resolves.toEqual({ email: 'user@yahoo.com' });
  });
});

describe('CustomImapEmailProvider', () => {
  const provider = new CustomImapEmailProvider();

  it('connects with PLAIN auth for imap-password', async () => {
    await provider.startWatch(imapPassword, {} as never);
    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'imap.example.com', auth: { method: 'PLAIN', password: 'p' } }),
    );
    expect(mockClose).toHaveBeenCalled();
  });

  it('requires host and username in oauth2 mode', async () => {
    await expect(provider.startWatch({ type: 'oauth2', accessToken: 't' } as never, {} as never)).rejects.toThrow(
      BadRequestError,
    );
  });

  it('polls new messages and advances the cursor', async () => {
    mockSearchUids.mockResolvedValue([3, 7]);
    mockFetchHeaders.mockResolvedValue([
      { uid: 3, messageId: 'm3' },
      { uid: 7, messageId: 'm7' },
    ]);
    const result = await provider.pollNewMessages(imapPassword, '2');
    expect(result).toEqual({
      messages: [
        { uid: 3, messageId: 'm3' },
        { uid: 7, messageId: 'm7' },
      ],
      newCursor: '7',
    });
  });

  it('returns the existing cursor when nothing is new', async () => {
    mockSearchUids.mockResolvedValue([]);
    await expect(provider.pollNewMessages(imapPassword, null)).resolves.toEqual({ messages: [], newCursor: '0' });
  });

  it('rejects unsupported calendar and draft operations', async () => {
    await expect(provider.createCalendarEvent('t', {} as never)).rejects.toThrow(BadRequestError);
    await expect(provider.createDraftReply('t', 'm', 'f', {} as never)).rejects.toThrow(BadRequestError);
  });

  it('reports static folder and no-op renew/stop', async () => {
    await expect(provider.listFolders('t')).resolves.toEqual([{ id: 'INBOX', name: 'Inbox' }]);
    await expect(provider.renewWatch(imapPassword, 's', null)).resolves.toEqual({
      type: 'imap-cursor',
      imapCursor: '0',
    });
    await expect(provider.stopWatch('t')).resolves.toBeUndefined();
    expect(provider.getProviderUrl({} as never, {} as never)).toBe('');
  });
});

describe.each([
  ['gmail', GmailImapEmailProvider, 'imap.gmail.com'],
  ['outlook', OutlookImapEmailProvider, 'outlook.office365.com'],
  ['fastmail-imap', FastmailImapEmailProvider, 'imap.fastmail.com'],
  ['icloud', AppleICloudEmailProvider, 'imap.mail.me.com'],
] as const)('%s IMAP provider', (_name, ProviderClass, expectedHost) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchUids.mockResolvedValue([]);
  });

  it('connects with PLAIN auth against its default host', async () => {
    const provider = new ProviderClass();
    await provider.startWatch(imapPassword, {} as never);
    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: expectedHost,
        port: 993,
        username: 'u',
        auth: { method: 'PLAIN', password: 'p' },
      }),
    );
    expect(provider.supportsWebhooks).toBe(false);
  });

  it('rejects non-imap-password credentials', async () => {
    const provider = new ProviderClass();
    await expect(provider.startWatch(oauth2, {} as never)).rejects.toThrow(BadRequestError);
    await expect(provider.createCalendarEvent('t', {} as never)).rejects.toThrow(BadRequestError);
    await expect(provider.createDraftReply('t', 'm', 'f', {} as never)).rejects.toThrow(BadRequestError);
  });
});

describe('FastmailEmailProvider', () => {
  const provider = new FastmailEmailProvider();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists folders from JMAP mailboxes', async () => {
    mockListMailboxes.mockResolvedValue([{ id: 'mb1', name: 'Inbox' }]);
    await expect(provider.listFolders('tok')).resolves.toEqual([{ id: 'mb1', name: 'Inbox' }]);
  });

  it('stops watch only when a subscription exists', async () => {
    await provider.stopWatch('tok');
    expect(mockDeletePush).not.toHaveBeenCalled();
    await provider.stopWatch('tok', 'sub-1');
    expect(mockDeletePush).toHaveBeenCalledWith('tok', 'sub-1');
  });

  it('starts watch with a tokenized webhook URL', async () => {
    mockCreatePush.mockResolvedValue({ id: 'sub-9' });
    const result = await provider.startWatch(oauth2, { baseUrl: 'https://app.example' } as never);
    expect(mockCreatePush).toHaveBeenCalledWith(
      'tok',
      'https://app.example/api/webhooks/fastmail/__APPLICATION_ID__',
    );
    expect(result).toMatchObject({ type: 'webhook', externalSubscriptionId: 'sub-9' });
  });

  it('requires OAuth2 credentials for watch operations', async () => {
    await expect(provider.startWatch(imapPassword, { baseUrl: 'https://x' } as never)).rejects.toThrow(
      BadRequestError,
    );
  });

  it('renews watch idempotently when the old subscription is gone', async () => {
    mockDeletePush.mockRejectedValue(new Error('gone'));
    const result = await provider.renewWatch(oauth2, 'sub-1', null);
    expect(result).toMatchObject({ type: 'webhook', externalSubscriptionId: 'sub-1' });
  });

  it('rejects polling and builds provider URLs', async () => {
    await expect(provider.pollNewMessages(oauth2, null)).rejects.toThrow(BadRequestError);
    expect(provider.getProviderUrl({ sourceDocumentId: 'abc' } as never, {} as never)).toContain('abc');
  });

  it('creates calendar events and draft replies', async () => {
    mockCreateCalendarEvent.mockResolvedValue({ id: 'ev-1' });
    mockCreateDraft.mockResolvedValue({ id: 'dr-1' });
    await expect(provider.createCalendarEvent('tok', {} as never)).resolves.toMatchObject({
      providerOperationId: 'ev-1',
    });
    await expect(provider.createDraftReply('tok', 'm', 'f', {} as never)).resolves.toMatchObject({
      providerOperationId: 'dr-1',
    });
  });
});
