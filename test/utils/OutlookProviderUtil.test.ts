import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';

describe('OutlookProviderUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendSelfSummaryReply', () => {
    it('sends a threaded reply and deletes the sent copy', async () => {
      const mockCreateReplyResponse = new Response(JSON.stringify({ id: 'draft-id-123' }), { status: 201 });
      const mockSendResponse = new Response('', { status: 202 });
      const mockDeleteResponse = new Response(null, { status: 204 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockCreateReplyResponse)
        .mockResolvedValueOnce(mockSendResponse)
        .mockResolvedValueOnce(mockDeleteResponse);

      vi.stubGlobal('fetch', fetchMock);

      const originalMessage = {
        id: 'original-msg-id',
        subject: 'Original subject',
        internetMessageHeaders: [
          { name: 'Message-ID', value: '<original@example.com>' },
          { name: 'References', value: '<root@example.com>' },
        ],
      };

      await OutlookProviderUtil.sendSelfSummaryReply(
        'test-access-token',
        originalMessage,
        'sender@example.com',
        'Summary <tag> & text\nNext line',
      );

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://graph.microsoft.com/v1.0/me/messages/original-msg-id/createReply',
        expect.objectContaining({ method: 'POST' }),
      );

      const createReplyCall = fetchMock.mock.calls[0];
      const createReplyHeaders = createReplyCall[1].headers as Headers;
      const rawMessage: string = decodeBase64(createReplyCall[1].body as string);
      const boundary: string = extractMimeBoundary(rawMessage);

      expect(createReplyHeaders.get('Content-Type')).toBe('text/plain');
      expect(rawMessage).toContain('From: sender@example.com');
      expect(rawMessage).toContain('To: sender@example.com');
      expect(rawMessage).toContain('Subject: Re: Original subject');
      expect(rawMessage).toContain('In-Reply-To: <original@example.com>');
      expect(rawMessage).toContain('References: <root@example.com> <original@example.com>');
      expect(rawMessage).toContain('X-Mail-Otter-Summary: true');
      expect(rawMessage).toContain(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      expect(rawMessage).toContain(`--${boundary}\r\nContent-Type: text/plain; charset=utf-8`);
      expect(rawMessage).toContain('Summary <tag> & text\r\nNext line');
      expect(rawMessage).toContain(`--${boundary}\r\nContent-Type: text/html; charset=utf-8`);
      expect(rawMessage).toContain('Summary &lt;tag&gt; &amp; text<br>\r\nNext line');
      expect(rawMessage).toContain(`--${boundary}--`);
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://graph.microsoft.com/v1.0/me/messages/draft-id-123/send',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        'https://graph.microsoft.com/v1.0/me/messages/draft-id-123',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('throws when send fails', async () => {
      const mockCreateReplyResponse = new Response(JSON.stringify({ id: 'draft-id-123' }), { status: 200 });
      const mockSendResponse = new Response('Send failed', { status: 500 });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockCreateReplyResponse)
        .mockResolvedValueOnce(mockSendResponse);

      vi.stubGlobal('fetch', fetchMock);

      await expect(
        OutlookProviderUtil.sendSelfSummaryReply('test-access-token', { id: 'original-msg-id' }, 'sender@example.com', 'Summary text'),
      ).rejects.toThrow('Microsoft Graph send summary failed (500): Send failed');
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

function decodeBase64(value: string): string {
  const binary: string = atob(value);
  const bytes: Uint8Array = Uint8Array.from(binary, (char: string): number => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function extractMimeBoundary(rawMessage: string): string {
  const match: RegExpMatchArray | null = rawMessage.match(/boundary="([^"]+)"/);
  expect(match).not.toBeNull();
  return match![1]!;
}
