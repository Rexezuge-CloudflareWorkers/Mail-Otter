import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNow = 1_778_200_000;
const mockAppId = 'app-123';
const mockUUID = 'uuid-456';
const mockEncryptedData = { encrypted: 'encrypted-val', iv: 'iv-val' };
const mockDecryptedCredentials = JSON.stringify({ refreshToken: 'rt', accessToken: 'at' });

vi.mock('@mail-otter/backend-data/crypto', () => ({
  encryptData: vi.fn(() => Promise.resolve(mockEncryptedData)),
  decryptData: vi.fn(() => Promise.resolve(mockDecryptedCredentials)),
}));

vi.mock('@mail-otter/shared/utils', () => ({
  TimestampUtil: { getCurrentUnixTimestampInSeconds: vi.fn(() => mockNow) },
  UUIDUtil: { getRandomUUID: vi.fn(() => mockUUID) },
}));

import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { encryptData } from '@mail-otter/backend-data/crypto';
import { UUIDUtil } from '@mail-otter/shared/utils';
import type {
  ConnectedApplicationInternal,
} from '@mail-otter/shared/model';
import type { D1Result } from '@mail-otter/shared/constants';

function createMockDb(overrides?: {
  firstResult?: unknown;
  allResults?: unknown[];
  runMeta?: { changes: number };
}): D1Database {
  const firstResult = overrides?.firstResult;
  const allResults = overrides?.allResults;
  const runMeta = overrides?.runMeta ?? { changes: 1 };
  const runFn = vi.fn().mockResolvedValue({ success: true, meta: runMeta } as D1Result);
  const firstFn = vi.fn().mockResolvedValue(firstResult ?? null);
  const allFn = vi.fn().mockResolvedValue({ results: allResults ?? [] } as D1Result);
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: runFn,
        first: firstFn,
        all: allFn,
      })),
    })),
  };
}

function createSampleRow(overrides?: Partial<ConnectedApplicationInternal>): ConnectedApplicationInternal {
  return {
    application_id: mockAppId,
    user_email: 'user@example.com',
    provider_email: null,
    display_name: 'My App',
    provider_id: 'google-gmail',
    connection_method: 'oauth2',
    encrypted_credentials: 'enc',
    credentials_iv: 'iv',
    status: 'draft',
    context_indexing_enabled: 1,
    max_context_documents: null,
    created_at: mockNow,
    updated_at: mockNow,
    ...overrides,
  };
}

describe('ConnectedApplicationDAO', () => {
  let dao: ConnectedApplicationDAO;
  let mockDb: D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    dao = new ConnectedApplicationDAO(mockDb, 'master-key');
  });

  describe('create', () => {
    it('inserts a new application and returns metadata', async () => {
      mockDb = createMockDb();
      const firstFn = vi.fn().mockResolvedValueOnce(createSampleRow());
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result),
          first: firstFn,
          all: vi.fn().mockResolvedValue({ results: [] } as D1Result),
        })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');
      (UUIDUtil.getRandomUUID as ReturnType<typeof vi.fn>).mockReturnValue('new-app-id');

      const result = await dao.create(
        'user@example.com', 'My App', 'google-gmail', 'oauth2',
        { refreshToken: 'rt' }, 'draft',
      );

      expect(result.applicationId).toBe(mockAppId);
      expect(encryptData).toHaveBeenCalledWith(JSON.stringify({ refreshToken: 'rt' }), 'key');
    });

    it('sets gmail pubsub topic when provided', async () => {
      const setConfigSpy = vi.spyOn(ConnectedApplicationDAO.prototype as never, 'setProviderConfig' as never);

      mockDb = createMockDb();
      const firstFn = vi.fn().mockResolvedValueOnce(createSampleRow());
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result),
          first: firstFn,
          all: vi.fn().mockResolvedValue({ results: [] } as D1Result),
        })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      await dao.create(
        'user@example.com', 'My App', 'google-gmail', 'oauth2',
        {}, 'draft', 'projects/p/topics/t',
      );

      expect(setConfigSpy).toHaveBeenCalledWith('new-app-id', 'gmail_pubsub_topic_name', 'projects/p/topics/t', mockNow);
    });
  });

  describe('listMetadataByUserEmail', () => {
    it('returns metadata list', async () => {
      const row = createSampleRow();
      mockDb = createMockDb({
        allResults: [row],
      });
      const allFn = vi.fn().mockResolvedValue({ results: [row] } as D1Result);
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const firstFn = vi.fn().mockResolvedValue(null);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.listMetadataByUserEmail('user@example.com');

      expect(result).toHaveLength(1);
      expect(result[0].applicationId).toBe(mockAppId);
    });

    it('returns empty array when no applications', async () => {
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const firstFn = vi.fn().mockResolvedValue(null);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.listMetadataByUserEmail('user@example.com');
      expect(result).toEqual([]);
    });
  });

  describe('countByUserEmail', () => {
    it('returns count', async () => {
      const firstFn = vi.fn().mockResolvedValue({ count: 3 });
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ first: firstFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.countByUserEmail('user@example.com');
      expect(result).toBe(3);
    });

    it('returns 0 when no rows', async () => {
      const firstFn = vi.fn().mockResolvedValue(null);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ first: firstFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.countByUserEmail('user@example.com');
      expect(result).toBe(0);
    });
  });

  describe('getById / getByIdForUser', () => {
    it('getById returns application with credentials', async () => {
      const row = createSampleRow();
      const firstFn = vi.fn().mockResolvedValue(row);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ first: firstFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.getById(mockAppId);
      expect(result?.applicationId).toBe(mockAppId);
      expect(result?.credentials).toEqual({ refreshToken: 'rt', accessToken: 'at' });
    });

    it('returns undefined when not found', async () => {
      const firstFn = vi.fn().mockResolvedValue(null);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ first: firstFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.getById('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getMetadataByIdForUser', () => {
    it('returns metadata with status draft', async () => {
      const row = createSampleRow({ status: 'draft' });
      const firstFn = vi.fn().mockResolvedValue(row);
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.getMetadataByIdForUser(mockAppId, 'user@example.com');
      expect(result?.status).toBe('draft');
    });
  });

  describe('markOAuth2Connected', () => {
    it('throws when application not found', async () => {
      const firstFn = vi.fn().mockResolvedValue(null);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ first: firstFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      await expect(
        dao.markOAuth2Connected(mockAppId, 'rt', 'email@provider.com'),
      ).rejects.toThrow('OAuth2 application was not found.');
    });

    it('updates credentials and status', async () => {
      const row = createSampleRow({ connection_method: 'oauth2' });
      const firstFn = vi.fn().mockResolvedValue(row);
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ first: firstFn, run: runFn, all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      await dao.markOAuth2Connected(mockAppId, 'new-rt', 'email@provider.com');

      expect(encryptData).toHaveBeenCalled();
    });
  });

  describe('updateOAuth2RefreshToken', () => {
    it('updates refresh token when application exists', async () => {
      const row = createSampleRow({ connection_method: 'oauth2' });
      const firstFn = vi.fn().mockResolvedValue(row);
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ first: firstFn, run: runFn, all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      await dao.updateOAuth2RefreshToken(mockAppId, 'new-rt');
    });

    it('does nothing when application not found', async () => {
      const firstFn = vi.fn().mockResolvedValue(null);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ first: firstFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      await dao.updateOAuth2RefreshToken(mockAppId, 'new-rt');
    });
  });

  describe('markError', () => {
    it('updates status to error', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      await dao.markError(mockAppId, 'something failed');
    });
  });

  describe('deleteForUser', () => {
    it('deletes the application', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      await dao.deleteForUser(mockAppId, 'user@example.com');
    });
  });

  describe('getProviderConfig / setProviderConfig / deleteProviderConfig', () => {
    it('getProviderConfig returns value', async () => {
      const firstFn = vi.fn().mockResolvedValue({ config_value: 'topic-val' });
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ first: firstFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.getProviderConfig(mockAppId, 'gmail_pubsub_topic_name');
      expect(result).toBe('topic-val');
    });

    it('getProviderConfig returns null when not found', async () => {
      const firstFn = vi.fn().mockResolvedValue(null);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ first: firstFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.getProviderConfig(mockAppId, 'nonexistent');
      expect(result).toBeNull();
    });

    it('setProviderConfig inserts or updates', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      await dao.setProviderConfig(mockAppId, 'key', 'value');
    });

    it('deleteProviderConfig deletes the config', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      await dao.deleteProviderConfig(mockAppId, 'key');
    });
  });

  describe('getWatchedFolders', () => {
    it('returns mapped folders', async () => {
      const allFn = vi.fn().mockResolvedValue({
        results: [
          { folder_path: 'INBOX', folder_name: 'Inbox' },
          { folder_path: 'LABEL_1', folder_name: null },
        ],
      } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.getWatchedFolders(mockAppId);
      expect(result).toEqual([
        { folderPath: 'INBOX', folderName: 'Inbox' },
        { folderPath: 'LABEL_1', folderName: 'LABEL_1' },
      ]);
    });

    it('returns empty array when no folders', async () => {
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.getWatchedFolders(mockAppId);
      expect(result).toEqual([]);
    });
  });

  describe('updateContextIndexingForUser', () => {
    it('updates and returns metadata', async () => {
      const row = createSampleRow();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const firstFn = vi.fn().mockResolvedValue(row);
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.updateContextIndexingForUser(mockAppId, 'user@example.com', true);
      expect(result?.applicationId).toBe(mockAppId);
    });
  });

  describe('updateMaxContextDocumentsForUser', () => {
    it('updates and returns metadata', async () => {
      const row = createSampleRow();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const firstFn = vi.fn().mockResolvedValue(row);
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.updateMaxContextDocumentsForUser(mockAppId, 'user@example.com', 50);
      expect(result?.applicationId).toBe(mockAppId);
    });
  });

  describe('listContextEnabledApplicationIdsByUserEmail', () => {
    it('returns application IDs', async () => {
      const allFn = vi.fn().mockResolvedValue({
        results: [{ application_id: 'app-1' }, { application_id: 'app-2' }],
      } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.listContextEnabledApplicationIdsByUserEmail('user@example.com');
      expect(result).toEqual(['app-1', 'app-2']);
    });
  });

  describe('updateWatchedFolderIdsForUser', () => {
    it('inserts folders when provided', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const firstFn = vi.fn().mockResolvedValue(createSampleRow());
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      await dao.updateWatchedFolderIdsForUser(mockAppId, 'user@example.com', ['INBOX', 'LABEL_1'], { INBOX: 'Inbox', LABEL_1: 'Label 1' });
    });

    it('clears folders when null', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const firstFn = vi.fn().mockResolvedValue(createSampleRow());
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      await dao.updateWatchedFolderIdsForUser(mockAppId, 'user@example.com', null);
    });

    it('clears folders when empty array', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const firstFn = vi.fn().mockResolvedValue(createSampleRow());
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      await dao.updateWatchedFolderIdsForUser(mockAppId, 'user@example.com', []);
    });
  });

  describe('updateForUser', () => {
    it('updates and returns metadata', async () => {
      const row = createSampleRow();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const firstFn = vi.fn().mockResolvedValue(row);
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const result = await dao.updateForUser(mockAppId, 'user@example.com', 'New Name', {}, 'draft');
      expect(result?.applicationId).toBe(mockAppId);
    });

    it('deletes gmail pubsub topic when null explicitly', async () => {
      const row = createSampleRow();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const firstFn = vi.fn().mockResolvedValue(row);
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      mockDb.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
      }));
      dao = new ConnectedApplicationDAO(mockDb, 'key');

      const deleteSpy = vi.spyOn(dao as never, 'deleteProviderConfig' as never);
      await dao.updateForUser(mockAppId, 'user@example.com', 'Name', {}, 'draft', null);
      expect(deleteSpy).toHaveBeenCalledWith(mockAppId, 'gmail_pubsub_topic_name');
    });
  });
});
