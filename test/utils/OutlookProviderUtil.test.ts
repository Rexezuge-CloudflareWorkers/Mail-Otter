import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';

describe('OutlookProviderUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendSelfSummaryReply', () => {
    it('creates a reply draft, copies it to inbox, and deletes the original draft', async () => {
      const mockCreateReplyResponse = new Response(JSON.stringify({ id: 'draft-id-123' }), { status: 201 });
      const mockCopyResponse = new Response(JSON.stringify({ id: 'copy-id-456' }), { status: 201 });
      const mockDeleteResponse = new Response(null, { status: 204 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockCreateReplyResponse)
        .mockResolvedValueOnce(mockCopyResponse)
        .mockResolvedValueOnce(mockDeleteResponse);

      vi.stubGlobal('fetch', fetchMock);

      const originalMessage = { id: 'original-msg-id' };

      const htmlSummary =
        '<p><strong>Gist:</strong> Summary &lt;tag&gt; &amp; text</p>\n<p><strong>Details:</strong></p>\n<ul>\n<li>Next line</li>\n</ul>';
      await OutlookProviderUtil.sendSelfSummaryReply(
        'test-access-token',
        originalMessage,
        'sender@example.com',
        htmlSummary,
      );

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://graph.microsoft.com/v1.0/me/messages/original-msg-id/createReply',
        expect.objectContaining({ method: 'POST' }),
      );

      const createReplyCall = fetchMock.mock.calls[0];
      const createReplyHeaders = createReplyCall[1].headers as Headers;
      const parsedBody: Record<string, unknown> = JSON.parse(createReplyCall[1].body as string);

      expect(createReplyHeaders.get('Content-Type')).toBe('application/json');
      expect(parsedBody).toEqual({
        message: {
          body: {
            contentType: 'html',
            content: htmlSummary,
          },
          toRecipients: [
            {
              emailAddress: {
                address: 'sender@example.com',
              },
            },
          ],
          internetMessageHeaders: [
            { name: 'X-Mail-Otter-Summary', value: 'true' },
          ],
        },
      });

      // Verify copy to inbox
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://graph.microsoft.com/v1.0/me/messages/draft-id-123/copy',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ destinationId: 'inbox' }),
        }),
      );

      // Verify delete original draft
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        'https://graph.microsoft.com/v1.0/me/messages/draft-id-123',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('skips deleting the draft when disable replacement is disabled', async () => {
      const mockCreateReplyResponse = new Response(JSON.stringify({ id: 'draft-id-123' }), { status: 201 });
      const mockCopyResponse = new Response(JSON.stringify({ id: 'copy-id-456' }), { status: 201 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockCreateReplyResponse)
        .mockResolvedValueOnce(mockCopyResponse);

      vi.stubGlobal('fetch', fetchMock);

      await OutlookProviderUtil.sendSelfSummaryReply(
        'test-access-token',
        { id: 'original-msg-id' },
        'sender@example.com',
        'Summary text',
        true,
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).not.toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/messages/draft-id-123',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('throws when copy fails', async () => {
      const mockCreateReplyResponse = new Response(JSON.stringify({ id: 'draft-id-123' }), { status: 200 });
      const mockCopyResponse = new Response('Copy failed', { status: 500 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockCreateReplyResponse)
        .mockResolvedValueOnce(mockCopyResponse);

      vi.stubGlobal('fetch', fetchMock);

      await expect(
        OutlookProviderUtil.sendSelfSummaryReply('test-access-token', { id: 'original-msg-id' }, 'sender@example.com', 'Summary text'),
      ).rejects.toThrow('Microsoft Graph copy message failed (500): Copy failed');
    });

    it('throws when createReply fails', async () => {
      const mockCreateReplyResponse = new Response(JSON.stringify({ error: { message: 'createReply failed' } }), { status: 400 });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockCreateReplyResponse));

      await expect(
        OutlookProviderUtil.sendSelfSummaryReply('test-access-token', { id: 'original-msg-id' }, 'sender@example.com', 'Summary text'),
      ).rejects.toThrow('Microsoft Graph request failed (400): createReply failed');
    });

    it('throws when draft has no id', async () => {
      const mockCreateReplyResponse = new Response('{}', { status: 200 });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockCreateReplyResponse));

      await expect(
        OutlookProviderUtil.sendSelfSummaryReply('test-access-token', { id: 'original-msg-id' }, 'sender@example.com', 'Summary text'),
      ).rejects.toThrow('Microsoft Graph createReply did not return a draft id.');
    });
  });
});
