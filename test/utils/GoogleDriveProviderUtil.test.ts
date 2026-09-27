import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleDriveProviderUtil } from '@mail-otter/provider-clients/google-drive';

const ACCESS_TOKEN = 'test-access-token';

describe('GoogleDriveProviderUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStartPageToken', () => {
    it('returns startPageToken on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ startPageToken: 'tok123' })));
      const token = await GoogleDriveProviderUtil.getStartPageToken(ACCESS_TOKEN);
      expect(token).toBe('tok123');
    });

    it('throws retryable error on 503', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('Service unavailable', { status: 503 })));
      await expect(GoogleDriveProviderUtil.getStartPageToken(ACCESS_TOKEN)).rejects.toThrow('Google Drive');
    });
  });

  describe('listChanges', () => {
    it('returns files and newStartPageToken when caught up', async () => {
      const apiResponse = {
        newStartPageToken: 'newTok',
        changes: [
          {
            fileId: 'file1',
            file: { id: 'file1', name: 'Doc.gdoc', mimeType: 'application/vnd.google-apps.document' },
          },
        ],
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(apiResponse)));

      const result = await GoogleDriveProviderUtil.listChanges(ACCESS_TOKEN, 'tok', 50);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].id).toBe('file1');
      expect(result.newStartPageToken).toBe('newTok');
      expect(result.nextPageToken).toBeNull();
    });

    it('returns nextPageToken when more pages exist', async () => {
      const page1 = {
        nextPageToken: 'next-tok',
        changes: [{ fileId: 'f1', file: { id: 'f1', name: 'a.txt', mimeType: 'text/plain' } }],
      };
      const page2 = {
        newStartPageToken: 'final-tok',
        changes: [{ fileId: 'f2', file: { id: 'f2', name: 'b.txt', mimeType: 'text/plain' } }],
      };
      const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(page1)).mockResolvedValueOnce(Response.json(page2));
      vi.stubGlobal('fetch', fetchMock);

      const result = await GoogleDriveProviderUtil.listChanges(ACCESS_TOKEN, 'tok', 50);

      expect(result.files).toHaveLength(2);
      expect(result.newStartPageToken).toBe('final-tok');
      expect(result.nextPageToken).toBeNull();
    });

    it('stops early when maxFiles is reached and returns nextPageToken', async () => {
      const page1 = {
        nextPageToken: 'overflow-tok',
        changes: [
          { fileId: 'f1', file: { id: 'f1', name: 'a.txt', mimeType: 'text/plain' } },
          { fileId: 'f2', file: { id: 'f2', name: 'b.txt', mimeType: 'text/plain' } },
        ],
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(page1)));

      const result = await GoogleDriveProviderUtil.listChanges(ACCESS_TOKEN, 'tok', 1);

      expect(result.files).toHaveLength(1);
      expect(result.nextPageToken).toBe('overflow-tok');
      expect(result.newStartPageToken).toBeNull();
    });

    it('excludes trashed files and records removed fileIds', async () => {
      const apiResponse = {
        newStartPageToken: 'newTok',
        changes: [
          { fileId: 'trashed-id', file: { id: 'trashed-id', name: 'x.txt', mimeType: 'text/plain', trashed: true } },
          { fileId: 'removed-id', removed: true },
          { fileId: 'ok-id', file: { id: 'ok-id', name: 'good.txt', mimeType: 'text/plain' } },
        ],
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(apiResponse)));

      const result = await GoogleDriveProviderUtil.listChanges(ACCESS_TOKEN, 'tok', 50);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].id).toBe('ok-id');
      expect(result.removed).toContain('removed-id');
    });

    it('ignores unsupported mime types', async () => {
      const apiResponse = {
        newStartPageToken: 'newTok',
        changes: [{ fileId: 'img-id', file: { id: 'img-id', name: 'photo.jpg', mimeType: 'image/jpeg' } }],
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(apiResponse)));

      const result = await GoogleDriveProviderUtil.listChanges(ACCESS_TOKEN, 'tok', 50);

      expect(result.files).toHaveLength(0);
      expect(result.newStartPageToken).toBe('newTok');
    });
  });

  describe('exportDocument', () => {
    it('returns response text on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('plain text content', { status: 200 })));
      const text = await GoogleDriveProviderUtil.exportDocument(ACCESS_TOKEN, 'doc-id');
      expect(text).toBe('plain text content');
    });

    it('throws non-retryable error on 404', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('Not found', { status: 404 })));
      await expect(GoogleDriveProviderUtil.exportDocument(ACCESS_TOKEN, 'bad-id')).rejects.toThrow('404');
    });
  });

  describe('downloadFile', () => {
    it('returns ArrayBuffer truncated to maxBytes', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(data.buffer, { status: 200 })));
      const result = await GoogleDriveProviderUtil.downloadFile(ACCESS_TOKEN, 'file-id', 3);
      expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3]));
    });
  });
});
