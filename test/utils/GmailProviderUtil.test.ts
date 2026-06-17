import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';

describe('GmailProviderUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendSummaryReply', () => {
    it('trashes the sent message after successful send', async () => {
      const mockSendResponse = new Response(JSON.stringify({ id: 'sent-message-id-123' }), { status: 200 });
      const mockTrashResponse = new Response('', { status: 200 });

      const fetchMock = vi.fn().mockResolvedValueOnce(mockSendResponse).mockResolvedValueOnce(mockTrashResponse);

      vi.stubGlobal('fetch', fetchMock);

      const originalMessage = {
        id: 'original-msg-id',
        threadId: 'thread-123',
        payload: {
          headers: [
            { name: 'Subject', value: 'Test Subject' },
            { name: 'Message-ID', value: '<original-msg-id@test.com>' },
          ],
        },
      };

      const htmlSummary =
        '<p><strong>Gist:</strong> Summary &lt;tag&gt; &amp; text</p>\n<p><strong>Details:</strong></p>\n<ul>\n<li>Next line</li>\n</ul>';
      await GmailProviderUtil.sendSummaryReply(
        'test-access-token',
        'sender@example.com',
        originalMessage as never,
        htmlSummary,
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);

      const sendCall = fetchMock.mock.calls[0];
      expect(sendCall[0]).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
      expect(sendCall[1].method).toBe('POST');

      const sendBody = JSON.parse(sendCall[1].body as string) as { threadId?: string; raw?: string };
      const rawMessage: string = decodeBase64Url(sendBody.raw || '');
      const boundary: string = extractMimeBoundary(rawMessage);
      expect(sendBody.threadId).toBe('thread-123');
      expect(rawMessage).toContain('X-Mail-Otter-Summary: true');
      expect(rawMessage).toContain(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      expect(rawMessage).toContain(`--${boundary}\r\nContent-Type: text/plain; charset=utf-8`);
      expect(rawMessage).toContain('Gist: Summary <tag> & text');
      expect(rawMessage).toContain(`--${boundary}\r\nContent-Type: text/html; charset=utf-8`);
      expect(rawMessage).toContain('<p><strong>Gist:</strong> Summary &lt;tag&gt; &amp; text</p>');
      expect(rawMessage).toContain(`--${boundary}--`);

      const trashCall = fetchMock.mock.calls[1];
      expect(trashCall[0]).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/sent-message-id-123/trash');
      expect(trashCall[1].method).toBe('POST');
      expect(trashCall[1].headers).toEqual({ Authorization: 'Bearer test-access-token' });
    });

    it('does not throw when trashing fails after successful send', async () => {
      const mockSendResponse = new Response(JSON.stringify({ id: 'sent-message-id-123' }), { status: 200 });
      const mockTrashResponse = new Response('Trash failed', { status: 500 });

      const fetchMock = vi.fn().mockResolvedValueOnce(mockSendResponse).mockResolvedValueOnce(mockTrashResponse);

      vi.stubGlobal('fetch', fetchMock);

      const originalMessage = {
        id: 'original-msg-id',
        threadId: 'thread-123',
        payload: { headers: [] },
      };

      await expect(
        GmailProviderUtil.sendSummaryReply('test-access-token', 'sender@example.com', originalMessage as never, 'Summary text'),
      ).resolves.toBeUndefined();
    });

    it('throws when the send API fails', async () => {
      const mockSendResponse = new Response('Send failed', { status: 500 });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockSendResponse));

      const originalMessage = {
        id: 'original-msg-id',
        threadId: 'thread-123',
        payload: { headers: [] },
      };

      await expect(
        GmailProviderUtil.sendSummaryReply('test-access-token', 'sender@example.com', originalMessage as never, 'Summary text'),
      ).rejects.toThrow('Gmail send summary failed (500): Send failed');

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });
  });
});

function decodeBase64Url(value: string): string {
  const normalized: string = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded: string = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary: string = atob(padded);
  const bytes: Uint8Array = Uint8Array.from(binary, (char: string): number => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function extractMimeBoundary(rawMessage: string): string {
  const match: RegExpMatchArray | null = rawMessage.match(/boundary="([^"]+)"/);
  expect(match).not.toBeNull();
  return match![1]!;
}
