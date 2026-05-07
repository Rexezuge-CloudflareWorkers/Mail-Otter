import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutlookProviderUtil } from '@/utils/OutlookProviderUtil';

describe('OutlookProviderUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendSelfSummaryReply', () => {
    it('sets saveToSentItems to false on the send request', async () => {
      const mockCreateReplyResponse = new Response(JSON.stringify({ id: 'draft-id-123' }), { status: 200 });
      const mockPatchResponse = new Response('', { status: 200 });
      const mockSendResponse = new Response('', { status: 202 });

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockCreateReplyResponse)
        .mockResolvedValueOnce(mockPatchResponse)
        .mockResolvedValueOnce(mockSendResponse);

      vi.stubGlobal('fetch', fetchMock);

      const _originalMessage = { id: 'original-msg-id' };

      await OutlookProviderUtil.sendSelfSummaryReply('test-access-token', 'original-msg-id', 'sender@example.com', 'Summary text');

      expect(fetchMock).toHaveBeenCalledTimes(3);

      const patchCall = fetchMock.mock.calls[1];
      const patchBody = JSON.parse(patchCall[1].body as string);
      expect(patchBody.saveToSentItems).toBeUndefined();

      const sendCall = fetchMock.mock.calls[2];
      const sendBody = JSON.parse(sendCall[1].body as string);
      expect(sendBody.saveToSentItems).toBe(false);
    });

    it('throws when createReply fails', async () => {
      const mockCreateReplyResponse = new Response(JSON.stringify({ error: { message: 'createReply failed' } }), { status: 400 });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockCreateReplyResponse));

      const _originalMessage = { id: 'original-msg-id' };

      await expect(
        OutlookProviderUtil.sendSelfSummaryReply('test-access-token', 'original-msg-id', 'sender@example.com', 'Summary text'),
      ).rejects.toThrow('Microsoft Graph API error: createReply failed');
    });

    it('throws when draft has no id', async () => {
      const mockCreateReplyResponse = new Response('{}', { status: 200 });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockCreateReplyResponse));

      const _originalMessage = { id: 'original-msg-id' };

      await expect(
        OutlookProviderUtil.sendSelfSummaryReply('test-access-token', 'original-msg-id', 'sender@example.com', 'Summary text'),
      ).rejects.toThrow('Microsoft Graph createReply did not return a draft id.');
    });

    it('throws when send fails', async () => {
      const mockCreateReplyResponse = new Response(JSON.stringify({ id: 'draft-id-123' }), { status: 200 });
      const mockPatchResponse = new Response('', { status: 200 });
      const mockSendResponse = new Response('Send failed', { status: 500 });

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockCreateReplyResponse)
        .mockResolvedValueOnce(mockPatchResponse)
        .mockResolvedValueOnce(mockSendResponse);

      vi.stubGlobal('fetch', fetchMock);

      const _originalMessage = { id: 'original-msg-id' };

      await expect(
        OutlookProviderUtil.sendSelfSummaryReply('test-access-token', 'original-msg-id', 'sender@example.com', 'Summary text'),
      ).rejects.toThrow('Microsoft Graph send summary failed: Send failed');
    });
  });
});
