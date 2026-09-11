import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FastmailProviderUtil } from '@mail-otter/provider-clients/fastmail';
import { YahooProviderUtil } from '@mail-otter/provider-clients/yahoo';

const SESSION = {
  apiUrl: 'https://api.fastmail.com/jmap/api/',
  accounts: {
    mail1: { name: 'user@fastmail.com', isPersonal: true },
    cal1: { name: 'calendar', isPersonal: true },
  },
  primaryAccounts: {
    'urn:ietf:params:jmap:mail': 'mail1',
    'urn:ietf:params:jmap:calendars': 'cal1',
  },
};

const EMAIL = {
  id: 'email-1',
  subject: 'Hello',
  from: [{ email: 'sender@example.com', name: 'Sender' }],
  messageId: ['<mid@example.com>'],
  threadId: 'thread-1',
};

function sessionResponse() {
  return { ok: true, statusText: 'OK', json: async () => structuredClone(SESSION) };
}

function apiResponse(payload: unknown) {
  return { ok: true, statusText: 'OK', json: async () => payload };
}

function installFetch(handler: (url: string, init?: RequestInit & { body?: string }) => unknown) {
  (globalThis as unknown as { fetch: unknown }).fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const body = typeof (init as { body?: unknown } | undefined)?.body === 'string'
      ? ((init as { body: string }).body as string)
      : undefined;
    return handler(url, { ...(init as object), body } as never);
  });
}

function routeJmapApi(methodCalls: unknown[][]) {
  const [method] = methodCalls[0] as [string, Record<string, unknown>];
  switch (method) {
    case 'Mailbox/get': {
      return apiResponse({ methodResponses: [[method, { list: [{ id: 'drafts-1', name: 'Drafts', role: 'drafts' }] }]] });
    }
    case 'Email/get': {
      return apiResponse({ methodResponses: [[method, { list: [EMAIL] }]] });
    }
    case 'Email/set': {
      return apiResponse({ methodResponses: [[method, { created: { draft: { id: 'draft-1' } } }]] });
    }
    case 'CalendarEvent/set': {
      return apiResponse({ methodResponses: [[method, { created: { event: { id: 'event-1', uid: 'uid-1' } } }]] });
    }
    case 'PushSubscription/set': {
      return apiResponse({ methodResponses: [[method, { created: { sub: { id: 'sub-1' } } }]] });
    }
    default: {
      return apiResponse({ methodResponses: [[method, {}]] });
    }
  }
}

function installDefaultFetch() {
  installFetch((url, init) => {
    if (url === 'https://api.fastmail.com/jmap/session') return sessionResponse();
    if (url === SESSION.apiUrl && init?.method === 'POST') {
      const parsed = JSON.parse((init as { body: string }).body as string) as { methodCalls: unknown[][] };
      return routeJmapApi(parsed.methodCalls);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe('FastmailProviderUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('fetches a JMAP session', async () => {
    installDefaultFetch();
    await expect(FastmailProviderUtil.getSession('tok')).resolves.toMatchObject({ apiUrl: SESSION.apiUrl });
  });

  it('throws when the session fetch fails', async () => {
    installFetch(() => ({ ok: false, statusText: 'Unauthorized', json: async () => ({}) }));
    await expect(FastmailProviderUtil.getSession('bad')).rejects.toThrow('Fastmail JMAP session fetch failed');
  });

  it('resolves the profile email from the primary mail account', async () => {
    installDefaultFetch();
    await expect(FastmailProviderUtil.getProfile('tok')).resolves.toEqual({
      email: 'user@fastmail.com',
      displayName: 'user@fastmail.com',
    });
  });

  it('throws when no primary mail account exists', async () => {
    installFetch((url) => {
      if (url === 'https://api.fastmail.com/jmap/session') {
        return { ok: true, statusText: 'OK', json: async () => ({ ...SESSION, primaryAccounts: {} }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    await expect(FastmailProviderUtil.getProfile('tok')).rejects.toThrow('No primary JMAP mail account');
  });

  it('lists mailboxes', async () => {
    installDefaultFetch();
    await expect(FastmailProviderUtil.listMailboxes('tok')).resolves.toEqual([
      { id: 'drafts-1', name: 'Drafts', role: 'drafts' },
    ]);
  });

  it('throws when the JMAP API call fails', async () => {
    installFetch((url, init) => {
      if (url === 'https://api.fastmail.com/jmap/session') return sessionResponse();
      return { ok: false, statusText: 'Boom', json: async () => ({}) };
    });
    await expect(FastmailProviderUtil.listMailboxes('tok')).rejects.toThrow('Fastmail JMAP API call failed');
  });

  it('fetches a single email', async () => {
    installDefaultFetch();
    await expect(FastmailProviderUtil.getEmail('tok', 'email-1')).resolves.toMatchObject({ id: 'email-1' });
  });

  it('throws when the email is not found', async () => {
    installFetch((url, init) => {
      if (url === 'https://api.fastmail.com/jmap/session') return sessionResponse();
      return apiResponse({ methodResponses: [['Email/get', { list: [] }]] });
    });
    await expect(FastmailProviderUtil.getEmail('tok', 'missing')).rejects.toThrow('Fastmail email not found');
  });

  it('creates a draft reply in the Drafts mailbox', async () => {
    installDefaultFetch();
    await expect(FastmailProviderUtil.createDraftReply('tok', 'email-1', 'reply body')).resolves.toEqual({
      id: 'draft-1',
    });
  });

  it('throws when no Drafts mailbox exists', async () => {
    installFetch((url, init) => {
      if (url === 'https://api.fastmail.com/jmap/session') return sessionResponse();
      const parsed = JSON.parse((init as { body: string }).body as string) as { methodCalls: unknown[][] };
      const [method] = parsed.methodCalls[0] as [string, Record<string, unknown>];
      if (method === 'Mailbox/get') {
        return apiResponse({ methodResponses: [[method, { list: [{ id: 'inbox', name: 'Inbox', role: 'inbox' }] }]] });
      }
      return routeJmapApi(parsed.methodCalls);
    });
    await expect(FastmailProviderUtil.createDraftReply('tok', 'email-1', 'body')).rejects.toThrow(
      'No Drafts mailbox found',
    );
  });

  it('throws when draft creation returns no id', async () => {
    installFetch((url, init) => {
      if (url === 'https://api.fastmail.com/jmap/session') return sessionResponse();
      const parsed = JSON.parse((init as { body: string }).body as string) as { methodCalls: unknown[][] };
      const [method] = parsed.methodCalls[0] as [string, Record<string, unknown>];
      if (method === 'Email/set') return apiResponse({ methodResponses: [[method, { created: {} }]] });
      return routeJmapApi(parsed.methodCalls);
    });
    await expect(FastmailProviderUtil.createDraftReply('tok', 'email-1', 'body')).rejects.toThrow(
      'draft creation returned no ID',
    );
  });

  it('creates a calendar event', async () => {
    installDefaultFetch();
    const result = await FastmailProviderUtil.createCalendarEvent('tok', {
      title: 'Sync',
      startTime: '2026-09-01T10:00:00Z',
      endTime: '2026-09-01T11:00:00Z',
    } as never);
    expect(result).toEqual({ id: 'event-1', uid: expect.any(String) });
  });

  it('throws when calendar access is not authorized', async () => {
    installFetch((url) => {
      if (url === 'https://api.fastmail.com/jmap/session') {
        return {
          ok: true,
          statusText: 'OK',
          json: async () => ({ ...SESSION, primaryAccounts: { 'urn:ietf:params:jmap:mail': 'mail1' } }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    await expect(FastmailProviderUtil.createCalendarEvent('tok', { title: 'x' } as never)).rejects.toThrow(
      'Calendar feature enabled',
    );
  });

  it('creates and deletes push subscriptions', async () => {
    installDefaultFetch();
    await expect(FastmailProviderUtil.createPushSubscription('tok', 'https://example.com/hook')).resolves.toEqual({
      id: 'sub-1',
    });
    await expect(FastmailProviderUtil.deletePushSubscription('tok', 'sub-1')).resolves.toBeUndefined();
  });

  it('throws when push subscription creation returns no id', async () => {
    installFetch((url, init) => {
      if (url === 'https://api.fastmail.com/jmap/session') return sessionResponse();
      const parsed = JSON.parse((init as { body: string }).body as string) as { methodCalls: unknown[][] };
      const [method] = parsed.methodCalls[0] as [string, Record<string, unknown>];
      if (method === 'PushSubscription/set') return apiResponse({ methodResponses: [[method, { created: {} }]] });
      return routeJmapApi(parsed.methodCalls);
    });
    await expect(FastmailProviderUtil.createPushSubscription('tok', 'https://example.com/hook')).rejects.toThrow(
      'push subscription creation returned no ID',
    );
  });

  it('downloads eligible image attachments and skips failures', async () => {
    installFetch((url, init) => {
      if (url === 'https://api.fastmail.com/jmap/session') return sessionResponse();
      if (typeof url === 'string' && url.includes('/jmap/download/')) {
        if (url.includes('bad-blob')) return { ok: false, statusText: 'Gone', arrayBuffer: async () => new ArrayBuffer(0) };
        return { ok: true, statusText: 'OK', arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
      }
      const parsed = JSON.parse((init as { body: string }).body as string) as { methodCalls: unknown[][] };
      return routeJmapApi(parsed.methodCalls);
    });
    const email = {
      id: 'email-1',
      attachments: [
        { blobId: 'good-blob', type: 'image/png', name: 'pic.png', size: 100 },
        { blobId: 'bad-blob', type: 'image/jpeg', name: 'bad.jpg', size: 100 },
        { blobId: 'big-blob', type: 'image/png', name: 'big.png', size: 10_000_000 },
        { blobId: 'pdf-blob', type: 'application/pdf', name: 'doc.pdf', size: 10 },
      ],
    };
    const results = await FastmailProviderUtil.downloadImageAttachments('tok', email, 1024, 5);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ filename: 'pic.png', mimeType: 'image/png', sizeBytes: 100 });
    expect(typeof results[0]?.base64Data).toBe('string');
  });

  it('returns empty when no attachments are eligible', async () => {
    installDefaultFetch();
    await expect(
      FastmailProviderUtil.downloadImageAttachments('tok', { id: 'e', attachments: [] }, 1024, 5),
    ).resolves.toEqual([]);
    await expect(
      FastmailProviderUtil.downloadImageAttachments('tok', { id: 'e' }, 1024, 5),
    ).resolves.toEqual([]);
  });
});

describe('YahooProviderUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns the profile email', async () => {
    installFetch(() => ({ ok: true, statusText: 'OK', json: async () => ({ email: 'user@yahoo.com' }) }));
    await expect(YahooProviderUtil.getProfile('tok')).resolves.toEqual({ email: 'user@yahoo.com' });
  });

  it('throws when userinfo fetch fails', async () => {
    installFetch(() => ({ ok: false, statusText: 'Forbidden', json: async () => ({}) }));
    await expect(YahooProviderUtil.getProfile('bad')).rejects.toThrow('Yahoo userinfo fetch failed');
  });

  it('throws when userinfo has no email', async () => {
    installFetch(() => ({ ok: true, statusText: 'OK', json: async () => ({ sub: '123' }) }));
    await expect(YahooProviderUtil.getProfile('tok')).rejects.toThrow('did not return an email address');
  });
});
