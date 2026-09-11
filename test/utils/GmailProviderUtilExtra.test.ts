import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GmailProviderUtil } from '../../packages/provider-clients/src/GmailProviderUtil';

function jsonResponse(data: unknown, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
  };
}

function decodeRaw(bodyJson: string): string {
  const parsed = JSON.parse(bodyJson) as { message?: { raw?: string }; raw?: string };
  const raw = parsed.message?.raw ?? parsed.raw ?? '';
  return Buffer.from(raw, 'base64url').toString('utf-8');
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(impl: (url: string, init?: RequestInit) => unknown) {
  fetchMock.mockImplementation(impl as never);
}

describe('GmailProviderUtil extended', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the gmail profile', async () => {
    stubFetch((url) => {
      expect(url).toContain('/users/me/profile');
      return jsonResponse({ emailAddress: 'user@gmail.com' });
    });
    await expect(GmailProviderUtil.getProfile('tok')).resolves.toEqual({ emailAddress: 'user@gmail.com' });
  });

  it('surfaces API errors with Gmail prefix', async () => {
    stubFetch(() => jsonResponse({ error: { message: 'gone' } }, 404, 'Not Found'));
    const error = await GmailProviderUtil.getProfile('tok').catch((e: unknown) => e as Error);
    expect(error.message).toContain('Gmail request failed (404)');
    expect(GmailProviderUtil.isMessageNotFoundError(error)).toBe(true);
  });

  it('lists labels sorted by name and defaults to empty', async () => {
    stubFetch(() => jsonResponse({ labels: [{ id: '2', name: 'b' }, { id: '1', name: 'a' }] }));
    await expect(GmailProviderUtil.listLabels('tok')).resolves.toEqual([
      { id: '1', name: 'a' },
      { id: '2', name: 'b' },
    ]);
    stubFetch(() => jsonResponse({}));
    await expect(GmailProviderUtil.listLabels('tok')).resolves.toEqual([]);
  });

  it('watches the inbox with explicit and default labels', async () => {
    const seen: string[] = [];
    stubFetch((_url, init) => {
      seen.push(String((JSON.parse(String((init as { body: string }).body)) as { labelIds: string[] }).labelIds));
      return jsonResponse({ historyId: 'h1', expiration: '1700000000000' });
    });
    await expect(GmailProviderUtil.watchInbox('tok', 'projects/x/topics/y', ['INBOX', 'UNREAD'])).resolves.toEqual({
      historyId: 'h1',
      expiresAt: 1700000000,
    });
    await expect(GmailProviderUtil.watchInbox('tok', 'projects/x/topics/y')).resolves.toEqual({
      historyId: 'h1',
      expiresAt: 1700000000,
    });
    await expect(GmailProviderUtil.watchInbox('tok', 'projects/x/topics/y', [])).resolves.toBeDefined();
    expect(seen[0]).toBe('INBOX,UNREAD');
    expect(seen[1]).toBe('INBOX');
  });

  it('throws when watch fails or omits fields', async () => {
    stubFetch(() => jsonResponse({ error: { message: 'denied' } }, 403, 'Forbidden'));
    await expect(GmailProviderUtil.watchInbox('tok', 't')).rejects.toThrow('Gmail watch failed');
    stubFetch(() => jsonResponse({ historyId: 'h1' }));
    await expect(GmailProviderUtil.watchInbox('tok', 't')).rejects.toThrow('Gmail watch failed');
  });

  it('stops watching and throws on failure', async () => {
    stubFetch(() => jsonResponse({}));
    await expect(GmailProviderUtil.stopWatch('tok')).resolves.toBeUndefined();
    stubFetch(() => jsonResponse('nope', 500, 'Server Error'));
    await expect(GmailProviderUtil.stopWatch('tok')).rejects.toThrow('Gmail stop failed');
  });

  it('lists message ids since a history id with a single label', async () => {
    stubFetch((url) => {
      expect(url).toContain('labelId=INBOX');
      return jsonResponse({
        historyId: 'h2',
        history: [{ messagesAdded: [{ message: { id: 'm1' } }, { message: {} }] }, {}],
      });
    });
    await expect(GmailProviderUtil.listMessageIdsSince('tok', 'h1', ['INBOX'])).resolves.toEqual({
      historyId: 'h2',
      messageIds: ['m1'],
    });
  });

  it('defaults to INBOX label and follows pagination with dedupe', async () => {
    const urls: string[] = [];
    stubFetch((url) => {
      urls.push(url);
      if (url.includes('pageToken')) {
        return jsonResponse({ historyId: 'h3', history: [{ messagesAdded: [{ message: { id: 'm1' } }] }] });
      }
      return jsonResponse({
        history: [{ messagesAdded: [{ message: { id: 'm1' } }, { message: { id: 'm2' } }] }],
        nextPageToken: 'p2',
      });
    });
    const result = await GmailProviderUtil.listMessageIdsSince('tok', 'h1');
    expect(result).toEqual({ historyId: 'h3', messageIds: ['m1', 'm2'] });
    expect(urls[0]).toContain('labelId=INBOX');
    expect(urls[1]).toContain('pageToken=p2');
  });

  it('omits labelId for multiple labels and keeps history id without updates', async () => {
    stubFetch((url) => {
      expect(url).not.toContain('labelId');
      return jsonResponse({});
    });
    await expect(GmailProviderUtil.listMessageIdsSince('tok', 'h9', ['A', 'B'])).resolves.toEqual({
      historyId: 'h9',
      messageIds: [],
    });
  });

  it('fetches a single message', async () => {
    stubFetch(() => jsonResponse({ id: 'm1', threadId: 't1' }));
    await expect(GmailProviderUtil.getMessage('tok', 'm1')).resolves.toMatchObject({ id: 'm1' });
  });

  it('classifies not-found errors', () => {
    expect(GmailProviderUtil.isMessageNotFoundError(new Error('Gmail request failed (404): gone'))).toBe(true);
    expect(GmailProviderUtil.isMessageNotFoundError(new Error('Gmail request failed (500): boom'))).toBe(false);
    expect(GmailProviderUtil.isMessageNotFoundError('Gmail request failed (404)')).toBe(true);
    expect(GmailProviderUtil.isMessageNotFoundError(undefined)).toBe(false);
  });

  it('creates calendar events', async () => {
    stubFetch(() => jsonResponse({ id: 'ev-1', htmlLink: 'https://cal/event' }));
    await expect(
      GmailProviderUtil.createCalendarEvent('tok', {
        eventTitle: 'Standup',
        startTime: '2026-09-01T10:00:00Z',
        endTime: '2026-09-01T10:30:00Z',
        timeZone: 'UTC',
      }),
    ).resolves.toEqual({ id: 'ev-1', htmlLink: 'https://cal/event' });
  });

  it('creates draft replies with and without explicit subjects', async () => {
    const bodies: string[] = [];
    stubFetch((_url, init) => {
      bodies.push(String((init as { body: string }).body));
      return jsonResponse({ id: 'd1', message: { id: 'm9', threadId: 't9' } });
    });
    const original = {
      id: 'm1',
      threadId: 't1',
      payload: {
        headers: [
          { name: 'Subject', value: 'Hello' },
          { name: 'Message-ID', value: '<a@b>' },
          { name: 'From', value: 'sender@example.com' },
        ],
      },
    } as never;
    await GmailProviderUtil.createDraftReply('tok', 'me@gmail.com', original, 'reply text');
    expect(decodeRaw(bodies[0] as string)).toContain('Re: Hello');
    expect(decodeRaw(bodies[0] as string)).toContain('In-Reply-To');
    await GmailProviderUtil.createDraftReply('tok', 'me@gmail.com', original, 'reply text', 'Custom subject');
    expect(decodeRaw(bodies[1] as string)).toContain('Custom subject');
    const noHeaders = { id: 'm2', threadId: 't2' } as never;
    await expect(
      GmailProviderUtil.createDraftReply('tok', 'me@gmail.com', noHeaders, 'hi'),
    ).resolves.toBeDefined();
  });

  it('modifies messages and throws on failure', async () => {
    stubFetch(() => jsonResponse({}));
    await expect(GmailProviderUtil.modifyMessage('tok', 'm1', ['UNREAD'], ['INBOX'])).resolves.toBeUndefined();
    stubFetch(() => jsonResponse('bad', 400, 'Bad Request'));
    await expect(GmailProviderUtil.modifyMessage('tok', 'm1')).rejects.toThrow('Gmail modify message failed');
  });

  it('finds existing labels case-insensitively or creates them', async () => {
    stubFetch(() => jsonResponse({ labels: [{ id: 'L1', name: 'Mail-Otter' }] }));
    await expect(GmailProviderUtil.findOrCreateLabel('tok', 'mail-otter')).resolves.toBe('L1');
    stubFetch((url, init) => {
      if ((init as { method?: string }).method === 'POST') return jsonResponse({ id: 'L2', name: 'New' });
      return jsonResponse({ labels: [] });
    });
    await expect(GmailProviderUtil.findOrCreateLabel('tok', 'New')).resolves.toBe('L2');
  });

  it('lists calendar events and defaults to empty', async () => {
    stubFetch(() => jsonResponse({ items: [{ id: 'e1' }] }));
    await expect(GmailProviderUtil.listCalendarEventsByDateRange('tok', '2026-09-01', '2026-09-02')).resolves.toEqual([
      { id: 'e1' },
    ]);
    stubFetch(() => jsonResponse({}));
    await expect(GmailProviderUtil.listCalendarEventsByDateRange('tok', '2026-09-01', '2026-09-02')).resolves.toEqual(
      [],
    );
  });

  it('sends standalone email and encodes unicode subjects', async () => {
    stubFetch((url) => {
      if (url.includes('/messages/send')) return jsonResponse({ id: 'sent-1' });
      return jsonResponse({});
    });
    await expect(GmailProviderUtil.sendStandaloneEmail('tok', 'me@gmail.com', 'Täglich digest', '<p>hi</p>')).resolves.toBeUndefined();
    const sendCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/messages/send'));
    const sendBody = String((sendCall?.[1] as { body: string }).body);
    expect(decodeRaw(sendBody)).toContain('=?UTF-8?B?');
  });

  it('throws when standalone send fails', async () => {
    stubFetch((url) => {
      if (url.includes('/messages/send')) return jsonResponse('denied', 403, 'Forbidden');
      return jsonResponse({});
    });
    await expect(GmailProviderUtil.sendStandaloneEmail('tok', 'me@gmail.com', 's', '<p>hi</p>')).rejects.toThrow(
      'Gmail send digest email failed',
    );
  });

  it('fetches attachments with zero defaults', async () => {
    stubFetch(() => jsonResponse({}));
    await expect(GmailProviderUtil.getAttachment('tok', 'm1', 'a1')).resolves.toEqual({ data: '', size: 0 });
    stubFetch(() => jsonResponse({ data: 'Zg==', size: 1 }));
    await expect(GmailProviderUtil.getAttachment('tok', 'm1', 'a1')).resolves.toEqual({ data: 'Zg==', size: 1 });
  });

  it('collects image attachments from inline data and attachment ids', async () => {
    stubFetch((url) => {
      expect(url).toContain('/attachments/att-1');
      return jsonResponse({ data: 'ab-cd_ef', size: 4 });
    });
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'image/png', filename: 'inline.png', body: { size: 3, data: 'xx-yy' } },
        { mimeType: 'image/jpeg', filename: 'remote.jpg', body: { size: 4, attachmentId: 'att-1' } },
        { mimeType: 'image/png', filename: 'big.png', body: { size: 99999, attachmentId: 'att-2' } },
        { mimeType: 'application/pdf', filename: 'doc.pdf', body: { size: 1, attachmentId: 'att-3' } },
        { mimeType: 'image/gif', filename: '', body: { size: 1, data: 'zz' } },
        { mimeType: 'image/webp', filename: 'noid.webp', body: { size: 1 } },
      ],
    } as never;
    const results = await GmailProviderUtil.getImageAttachments('tok', 'm1', payload, 100, 10);
    expect(results.map((r) => r.filename)).toEqual(['inline.png', 'remote.jpg']);
    expect(results[0]?.base64Data).toBe('xx+yy');
    expect(results[1]?.base64Data).toBe('ab+cd/ef');
  });

  it('returns empty for missing payloads and respects max count', async () => {
    await expect(GmailProviderUtil.getImageAttachments('tok', 'm1', undefined, 100, 10)).resolves.toEqual([]);
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'image/png', filename: 'a.png', body: { size: 1, data: 'AA' } },
        { mimeType: 'image/png', filename: 'b.png', body: { size: 1, data: 'QkI' } },
      ],
    } as never;
    const results = await GmailProviderUtil.getImageAttachments('tok', 'm1', payload, 100, 1);
    expect(results).toHaveLength(1);
  });
});
