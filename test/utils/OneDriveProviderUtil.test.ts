import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OneDriveProviderUtil } from '@mail-otter/provider-clients/onedrive';

const ACCESS_TOKEN = 'test-access-token';

describe('OneDriveProviderUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDelta', () => {
    it('returns items and deltaLink when caught up (no nextLink)', async () => {
      const apiResponse = {
        value: [
          {
            id: 'item1',
            name: 'doc.docx',
            size: 1024,
            file: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
          },
        ],
        '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc',
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(apiResponse)));

      const result = await OneDriveProviderUtil.getDelta(ACCESS_TOKEN);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('item1');
      expect(result.deltaLink).toBe('https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc');
      expect(result.nextLink).toBeNull();
    });

    it('returns nextLink when more pages exist', async () => {
      const page1 = {
        value: [{ id: 'i1', name: 'a.txt', size: 100, file: { mimeType: 'text/plain' } }],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/drive/root/delta?nextToken=xyz',
      };
      const page2 = {
        value: [{ id: 'i2', name: 'b.txt', size: 100, file: { mimeType: 'text/plain' } }],
        '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/drive/root/delta?token=final',
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(page1)).mockResolvedValueOnce(Response.json(page2)));

      const result = await OneDriveProviderUtil.getDelta(ACCESS_TOKEN);

      expect(result.items).toHaveLength(2);
      expect(result.deltaLink).toBe('https://graph.microsoft.com/v1.0/me/drive/root/delta?token=final');
    });

    it('separates deleted items into deletedIds', async () => {
      const apiResponse = {
        value: [
          { id: 'del1', name: 'gone.txt', deleted: { state: 'softDeleted' } },
          { id: 'ok1', name: 'alive.txt', size: 50, file: { mimeType: 'text/plain' } },
        ],
        '@odata.deltaLink': 'https://graph.microsoft.com/delta?tok=x',
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(apiResponse)));

      const result = await OneDriveProviderUtil.getDelta(ACCESS_TOKEN);

      expect(result.deletedIds).toContain('del1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('ok1');
    });

    it('uses provided deltaOrNextLink as the request URL', async () => {
      const customLink = 'https://graph.microsoft.com/v1.0/me/drive/root/delta?$deltaToken=custom';
      const apiResponse = {
        value: [],
        '@odata.deltaLink': customLink,
      };
      const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(apiResponse));
      vi.stubGlobal('fetch', fetchMock);

      await OneDriveProviderUtil.getDelta(ACCESS_TOKEN, customLink);

      expect(fetchMock.mock.calls[0][0]).toBe(customLink);
    });

    it('stops early when maxItems is reached', async () => {
      const page1 = {
        value: [
          { id: 'i1', name: 'a.txt', size: 50, file: { mimeType: 'text/plain' } },
          { id: 'i2', name: 'b.txt', size: 50, file: { mimeType: 'text/plain' } },
        ],
        '@odata.nextLink': 'https://graph.microsoft.com/next',
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(page1)));

      const result = await OneDriveProviderUtil.getDelta(ACCESS_TOKEN, undefined, 1);

      expect(result.items).toHaveLength(1);
      expect(result.nextLink).toBe('https://graph.microsoft.com/next');
    });
  });

  describe('downloadItem', () => {
    it('returns ArrayBuffer truncated to maxBytes', async () => {
      const data = new Uint8Array([10, 20, 30, 40, 50]);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(data.buffer, { status: 200 })));
      const result = await OneDriveProviderUtil.downloadItem('https://cdn.example.com/file', 3);
      expect(new Uint8Array(result)).toEqual(new Uint8Array([10, 20, 30]));
    });
  });

  describe('convertItemToPdf', () => {
    it('calls graph items convert endpoint and returns ArrayBuffer', async () => {
      const pdfData = new Uint8Array([1, 2, 3]);
      const fetchMock = vi.fn().mockResolvedValueOnce(new Response(pdfData.buffer, { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await OneDriveProviderUtil.convertItemToPdf(ACCESS_TOKEN, 'item-abc', 1024 * 1024);

      expect(fetchMock.mock.calls[0][0]).toContain('/me/drive/items/item-abc/content?format=pdf');
      expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('throws on API error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('Unauthorized', { status: 401 })));
      await expect(OneDriveProviderUtil.convertItemToPdf(ACCESS_TOKEN, 'item-id', 1024)).rejects.toThrow('401');
    });
  });
});
