import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';

// SHA-256('original-msg-id').slice(0, 8 bytes) as hex = '45da5cec0da75b4c'
const EXPECTED_MARKER = '45da5cec0da75b4c';

function mockEmptyResponse(): Response {
  return Response.json({ value: [] }, { status: 200 });
}

describe('OutlookProviderUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendSelfSummaryReply', () => {
    it('sends summary as a reply, finds sent message, copies to inbox, and deletes sent copy', async () => {
      const mockReplyResponse = new Response(null, { status: 202 });
      const mockFindResponse = Response.json({ value: [{ id: 'sent-msg-id' }] }, { status: 200 });
      const mockCopyResponse = Response.json({ id: 'copy-id-456' }, { status: 201 });
      const mockDeleteResponse = new Response(null, { status: 204 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockEmptyResponse())   // inbox check
        .mockResolvedValueOnce(mockEmptyResponse())   // sentitems check
        .mockResolvedValueOnce(mockReplyResponse)     // reply
        .mockResolvedValueOnce(mockFindResponse)      // find after reply
        .mockResolvedValueOnce(mockCopyResponse)      // copy
        .mockResolvedValueOnce(mockDeleteResponse);   // delete

      vi.stubGlobal('fetch', fetchMock);

      const originalMessage = { id: 'original-msg-id' };

      const htmlSummary =
        '<p>Summary &lt;tag&gt; &amp; text</p>\n<p><strong>Details:</strong></p>\n<ul>\n<li>Next line</li>\n</ul>';
      await OutlookProviderUtil.sendSelfSummaryReply(
        'test-access-token',
        originalMessage,
        'sender@example.com',
        htmlSummary,
      );

      expect(fetchMock).toHaveBeenCalledTimes(6);

      // Step 1: inbox idempotency check uses deterministic marker, no $orderby
      const inboxUrl = fetchMock.mock.calls[0][0] as string;
      expect(inboxUrl).toContain('/me/mailFolders/inbox/messages');
      expect(inboxUrl).toContain(encodeURIComponent(`[${EXPECTED_MARKER}]`));
      expect(inboxUrl).not.toContain('orderby');

      // Step 2: sent items idempotency check uses same deterministic marker
      const sentItemsCheckUrl = fetchMock.mock.calls[1][0] as string;
      expect(sentItemsCheckUrl).toContain('/me/mailFolders/sentitems/messages');
      expect(sentItemsCheckUrl).toContain(encodeURIComponent(`[${EXPECTED_MARKER}]`));
      expect(sentItemsCheckUrl).not.toContain('orderby');

      // Step 3: reply with sink address
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        'https://graph.microsoft.com/v1.0/me/messages/original-msg-id/reply',
        expect.objectContaining({ method: 'POST' }),
      );

      const replyCall = fetchMock.mock.calls[2];
      const replyHeaders = replyCall[1].headers as Record<string, string>;
      const parsedBody: Record<string, unknown> = JSON.parse(replyCall[1].body as string);

      expect(replyHeaders['Content-Type']).toBe('application/json');
      expect(replyHeaders['Authorization']).toBe('Bearer test-access-token');
      expect(parsedBody.message.subject).toBe(`[${EXPECTED_MARKER}] Re: `);
      expect(parsedBody.message.body).toEqual({
        contentType: 'html',
        content: htmlSummary,
      });
      expect(parsedBody.message.toRecipients).toEqual([
        { emailAddress: { address: 'sender+sink@example.com' } },
      ]);
      expect(parsedBody.message.internetMessageHeaders).toEqual([
        { name: 'X-Mail-Otter-Summary', value: 'true' },
      ]);

      // Step 4: find sent summary message by same marker, no $orderby
      const findUrl = fetchMock.mock.calls[3][0] as string;
      expect(findUrl).toContain('/me/mailFolders/sentitems/messages');
      expect(findUrl).toContain(encodeURIComponent(`[${EXPECTED_MARKER}]`));
      expect(findUrl).toContain(encodeURIComponent('$top') + '=1');
      expect(findUrl).not.toContain('orderby');

      // Step 5: copy sent message to inbox
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        'https://graph.microsoft.com/v1.0/me/messages/sent-msg-id/copy',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ destinationId: 'inbox' }),
        }),
      );

      // Step 6: delete sent copy
      expect(fetchMock).toHaveBeenNthCalledWith(
        6,
        'https://graph.microsoft.com/v1.0/me/messages/sent-msg-id',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('skips when summary already exists in inbox and no stale sent copy', async () => {
      const mockInboxResponse = Response.json({ value: [{ id: 'inbox-msg-id' }] }, { status: 200 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockInboxResponse)   // inbox check (found)
        .mockResolvedValueOnce(mockEmptyResponse()); // sentitems check (empty)

      vi.stubGlobal('fetch', fetchMock);

      await OutlookProviderUtil.sendSelfSummaryReply(
        'test-access-token',
        { id: 'original-msg-id' },
        'sender@example.com',
        'Summary text',
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const inboxUrl = fetchMock.mock.calls[0][0] as string;
      expect(inboxUrl).toContain('/me/mailFolders/inbox/messages');
      expect(inboxUrl).toContain(encodeURIComponent(`[${EXPECTED_MARKER}]`));
    });

    it('deletes stale Sent Items copy when summary already exists in inbox', async () => {
      const mockInboxResponse = Response.json({ value: [{ id: 'inbox-msg-id' }] }, { status: 200 });
      const mockSentItemsResponse = Response.json({ value: [{ id: 'stale-sent-id' }] }, { status: 200 });
      const mockDeleteResponse = new Response(null, { status: 204 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockInboxResponse)     // inbox check (found)
        .mockResolvedValueOnce(mockSentItemsResponse) // sentitems check (stale copy found)
        .mockResolvedValueOnce(mockDeleteResponse);   // delete stale copy

      vi.stubGlobal('fetch', fetchMock);

      await OutlookProviderUtil.sendSelfSummaryReply(
        'test-access-token',
        { id: 'original-msg-id' },
        'sender@example.com',
        'Summary text',
      );

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        'https://graph.microsoft.com/v1.0/me/messages/stale-sent-id',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('skips reply and only copies and deletes when summary already in sent items', async () => {
      const mockSentItemsResponse = Response.json({ value: [{ id: 'sent-msg-id' }] }, { status: 200 });
      const mockCopyResponse = Response.json({ id: 'copy-id-456' }, { status: 201 });
      const mockDeleteResponse = new Response(null, { status: 204 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockEmptyResponse())    // inbox check (empty)
        .mockResolvedValueOnce(mockSentItemsResponse)  // sentitems check (found)
        .mockResolvedValueOnce(mockCopyResponse)       // copy
        .mockResolvedValueOnce(mockDeleteResponse);    // delete

      vi.stubGlobal('fetch', fetchMock);

      await OutlookProviderUtil.sendSelfSummaryReply(
        'test-access-token',
        { id: 'original-msg-id' },
        'sender@example.com',
        'Summary text',
      );

      expect(fetchMock).toHaveBeenCalledTimes(4);

      // No reply call
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        'https://graph.microsoft.com/v1.0/me/messages/sent-msg-id/copy',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        'https://graph.microsoft.com/v1.0/me/messages/sent-msg-id',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('throws when reply fails', async () => {
      const mockReplyResponse = new Response('Reply failed', { status: 500 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockEmptyResponse())    // inbox check
        .mockResolvedValueOnce(mockEmptyResponse())    // sentitems check
        .mockResolvedValue(mockReplyResponse);          // reply fails

      vi.stubGlobal('fetch', fetchMock);

      await expect(
        OutlookProviderUtil.sendSelfSummaryReply('test-access-token', { id: 'original-msg-id' }, 'sender@example.com', 'Summary text'),
      ).rejects.toThrow('Microsoft Graph send summary reply failed (500): Reply failed');
    });

    it('throws when find returns no results after reply (all retries exhausted)', async () => {
      // Bypass sleep delays so the test runs instantly
      vi.spyOn(OutlookProviderUtil as unknown as { sleep: () => Promise<void> }, 'sleep').mockResolvedValue(undefined);

      const mockReplyResponse = new Response(null, { status: 202 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockEmptyResponse())                           // inbox check
        .mockResolvedValueOnce(mockEmptyResponse())                           // sentitems check
        .mockResolvedValueOnce(mockReplyResponse)                             // reply
        .mockImplementation(() => Promise.resolve(mockEmptyResponse()));      // all 4 find retries (fresh body each time)

      vi.stubGlobal('fetch', fetchMock);

      await expect(
        OutlookProviderUtil.sendSelfSummaryReply('test-access-token', { id: 'original-msg-id' }, 'sender@example.com', 'Summary text'),
      ).rejects.toThrow('Microsoft Graph did not return the sent summary message.');

      expect(fetchMock).toHaveBeenCalledTimes(7); // 2 idempotency + 1 reply + 4 find retries
    });

    it('throws when find fails after reply', async () => {
      const mockReplyResponse = new Response(null, { status: 202 });
      const mockFindFailResponse = Response.json({ error: { message: 'Find failed' } }, { status: 500 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockEmptyResponse())      // inbox check
        .mockResolvedValueOnce(mockEmptyResponse())      // sentitems check
        .mockResolvedValueOnce(mockReplyResponse)        // reply
        .mockResolvedValueOnce(mockFindFailResponse);    // find fails

      vi.stubGlobal('fetch', fetchMock);

      await expect(
        OutlookProviderUtil.sendSelfSummaryReply('test-access-token', { id: 'original-msg-id' }, 'sender@example.com', 'Summary text'),
      ).rejects.toThrow('Microsoft Graph request failed (500): Find failed');
    });

    it('throws when copy fails', async () => {
      const mockReplyResponse = new Response(null, { status: 202 });
      const mockFindResponse = Response.json({ value: [{ id: 'sent-msg-id' }] }, { status: 200 });
      const mockCopyFailResponse = new Response('Copy failed', { status: 500 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockEmptyResponse())     // inbox check
        .mockResolvedValueOnce(mockEmptyResponse())     // sentitems check
        .mockResolvedValueOnce(mockReplyResponse)       // reply
        .mockResolvedValueOnce(mockFindResponse)        // find after reply
        .mockResolvedValueOnce(mockCopyFailResponse);   // copy fails

      vi.stubGlobal('fetch', fetchMock);

      await expect(
        OutlookProviderUtil.sendSelfSummaryReply('test-access-token', { id: 'original-msg-id' }, 'sender@example.com', 'Summary text'),
      ).rejects.toThrow('Microsoft Graph copy message failed (500): Copy failed');
    });

    it('throws when delete fails', async () => {
      const mockReplyResponse = new Response(null, { status: 202 });
      const mockFindResponse = Response.json({ value: [{ id: 'sent-msg-id' }] }, { status: 200 });
      const mockCopyResponse = Response.json({ id: 'copy-id-456' }, { status: 201 });
      const mockDeleteFailResponse = new Response('Delete failed', { status: 500 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockEmptyResponse())       // inbox check
        .mockResolvedValueOnce(mockEmptyResponse())       // sentitems check
        .mockResolvedValueOnce(mockReplyResponse)         // reply
        .mockResolvedValueOnce(mockFindResponse)          // find after reply
        .mockResolvedValueOnce(mockCopyResponse)          // copy
        .mockResolvedValueOnce(mockDeleteFailResponse);   // delete fails

      vi.stubGlobal('fetch', fetchMock);

      await expect(
        OutlookProviderUtil.sendSelfSummaryReply('test-access-token', { id: 'original-msg-id' }, 'sender@example.com', 'Summary text'),
      ).rejects.toThrow('Microsoft Graph delete message failed (500): Delete failed');
    });
  });
});
