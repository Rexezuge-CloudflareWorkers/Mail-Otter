import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutlookProviderUtil } from '@/utils/OutlookProviderUtil';

describe('OutlookProviderUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendSelfSummaryReply', () => {
    it('sends summary through sendMail without saving to sent items', async () => {
      const mockSendResponse = new Response('', { status: 202 });

      const fetchMock = vi.fn().mockResolvedValueOnce(mockSendResponse);

      vi.stubGlobal('fetch', fetchMock);

      const originalMessage = {
        id: 'original-msg-id',
        subject: 'Original subject',
        internetMessageHeaders: [
          { name: 'Message-ID', value: '<original@example.com>' },
          { name: 'References', value: '<root@example.com>' },
        ],
      };

      await OutlookProviderUtil.sendSelfSummaryReply('test-access-token', originalMessage, 'sender@example.com', 'Summary text');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/me/sendMail', expect.any(Object));

      const sendCall = fetchMock.mock.calls[0];
      const sendBody = JSON.parse(sendCall[1].body as string);

      expect(sendBody.saveToSentItems).toBe(false);
      expect(sendBody.message).toMatchObject({
        subject: 'Re: Original subject',
        body: { contentType: 'Text', content: 'Summary text' },
        toRecipients: [{ emailAddress: { address: 'sender@example.com' } }],
      });
      expect(sendBody.message.internetMessageHeaders).toEqual([
        { name: 'X-Mail-Otter-Summary', value: 'true' },
      ]);
    });

    it('does not double-prefix reply subjects', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 202 })));

      await OutlookProviderUtil.sendSelfSummaryReply(
        'test-access-token',
        { id: 'original-msg-id', subject: 'Re: Original subject' },
        'sender@example.com',
        'Summary text',
      );

      const fetchMock = vi.mocked(fetch);
      const sendBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);

      expect(sendBody.message.subject).toBe('Re: Original subject');
    });

    it('throws when send fails', async () => {
      const mockSendResponse = new Response('Send failed', { status: 500 });

      const fetchMock = vi.fn().mockResolvedValueOnce(mockSendResponse);

      vi.stubGlobal('fetch', fetchMock);

      await expect(
        OutlookProviderUtil.sendSelfSummaryReply(
          'test-access-token',
          { id: 'original-msg-id' },
          'sender@example.com',
          'Summary text',
        ),
      ).rejects.toThrow('Microsoft Graph send summary failed: Send failed');
    });
  });
});
