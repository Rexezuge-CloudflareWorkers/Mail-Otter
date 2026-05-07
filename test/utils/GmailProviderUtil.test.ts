import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GmailProviderUtil } from '@/utils/GmailProviderUtil';

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

      await GmailProviderUtil.sendSummaryReply('test-access-token', 'sender@example.com', originalMessage as never, 'Summary text');

      expect(fetchMock).toHaveBeenCalledTimes(2);

      const sendCall = fetchMock.mock.calls[0];
      expect(sendCall[0]).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
      expect(sendCall[1].method).toBe('POST');

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
      ).rejects.toThrow('Gmail send summary failed: Send failed');

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });
  });
});
