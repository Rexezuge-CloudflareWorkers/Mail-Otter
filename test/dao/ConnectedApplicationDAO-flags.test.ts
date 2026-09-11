import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNow = 1_778_200_000;
const mockAppId = 'app-123';

vi.mock('@mail-otter/backend-data/crypto', () => ({
  encryptData: vi.fn(() => Promise.resolve({ encrypted: 'enc', iv: 'iv' })),
  decryptData: vi.fn(() => Promise.resolve('{}')),
}));

vi.mock('@mail-otter/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mail-otter/shared/utils')>();
  return {
    ...actual,
    TimestampUtil: { getCurrentUnixTimestampInSeconds: vi.fn(() => mockNow) },
  };
});

import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';

function createMockDb(overrides?: { firstResult?: unknown; allResults?: unknown[] }): D1Database {
  const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
  const firstFn = vi.fn().mockResolvedValue(overrides?.firstResult ?? null);
  const allFn = vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] });
  const bindFn = vi.fn(() => ({ run: runFn, first: firstFn, all: allFn }));
  return {
    prepare: vi.fn(() => ({ bind: bindFn })),
    __fns: { runFn, firstFn, allFn, bindFn },
  } as unknown as D1Database;
}

function fns(db: D1Database) {
  return (db as unknown as { __fns: Record<string, ReturnType<typeof vi.fn>> }).__fns;
}

describe('ConnectedApplicationDAO flags and provider-config helpers', () => {
  let dao: ConnectedApplicationDAO;
  let mockDb: D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    dao = new ConnectedApplicationDAO(mockDb, 'master-key');
  });

  describe('markImapConnected', () => {
    it('marks the application connected over IMAP', async () => {
      await dao.markImapConnected(mockAppId, 'user@example.com');

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SET provider_email'));
      expect(fns(mockDb).bindFn).toHaveBeenCalledWith(
        'user@example.com',
        'connected',
        mockNow,
        mockAppId,
        'imap-password',
      );
    });
  });

  describe('updateRagRetrievalForUser', () => {
    it('enables retrieval with flag 1', async () => {
      await dao.updateRagRetrievalForUser(mockAppId, 'user@example.com', true);

      expect(fns(mockDb).bindFn).toHaveBeenCalledWith(1, mockNow, mockAppId, 'user@example.com');
    });

    it('disables retrieval with flag 0', async () => {
      await dao.updateRagRetrievalForUser(mockAppId, 'user@example.com', false);

      expect(fns(mockDb).bindFn).toHaveBeenCalledWith(0, mockNow, mockAppId, 'user@example.com');
    });
  });

  describe('listApplicationIdsWithFeatureEnabled', () => {
    it('maps matching rows to application ids', async () => {
      mockDb = createMockDb({ allResults: [{ application_id: 'app-1' }, { application_id: 'app-2' }] });
      dao = new ConnectedApplicationDAO(mockDb, 'master-key');

      await expect(dao.listApplicationIdsWithFeatureEnabled('summarization')).resolves.toEqual(['app-1', 'app-2']);
      expect(fns(mockDb).bindFn).toHaveBeenCalledWith('summarization');
    });

    it('returns an empty list when nothing matches', async () => {
      await expect(dao.listApplicationIdsWithFeatureEnabled('unknown-feature')).resolves.toEqual([]);
    });
  });

  describe('listApplicationIdsWithProviderConfig', () => {
    it('maps matching rows to application ids', async () => {
      mockDb = createMockDb({ allResults: [{ application_id: 'app-9' }] });
      dao = new ConnectedApplicationDAO(mockDb, 'master-key');

      await expect(dao.listApplicationIdsWithProviderConfig('content_language', 'de')).resolves.toEqual(['app-9']);
      expect(fns(mockDb).bindFn).toHaveBeenCalledWith('content_language', 'de');
    });
  });

  describe('updateAttachmentVisionEnabledForUser', () => {
    it('stores true/false strings via the provider-config row', async () => {
      await dao.updateAttachmentVisionEnabledForUser(mockAppId, 'user@example.com', true);
      expect(fns(mockDb).bindFn).toHaveBeenCalledWith(
        mockAppId,
        'attachment_vision_enabled',
        'true',
        mockNow,
        mockNow,
      );

      vi.clearAllMocks();
      await dao.updateAttachmentVisionEnabledForUser(mockAppId, 'user@example.com', false);
      expect(fns(mockDb).bindFn).toHaveBeenCalledWith(
        mockAppId,
        'attachment_vision_enabled',
        'false',
        mockNow,
        mockNow,
      );
    });
  });

  describe('updateContentLanguageForUser', () => {
    it('normalizes and stores the language', async () => {
      await dao.updateContentLanguageForUser(mockAppId, 'user@example.com', 'de');

      expect(fns(mockDb).bindFn).toHaveBeenCalledWith(mockAppId, 'content_language', 'de', mockNow, mockNow);
    });

    it('deletes the row when the language is cleared', async () => {
      await dao.updateContentLanguageForUser(mockAppId, 'user@example.com', null);

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM provider_application_configs'));
      expect(fns(mockDb).bindFn).toHaveBeenCalledWith(mockAppId, 'content_language');
    });
  });

  describe('updateEmailProcessingRulesForUser', () => {
    it('stores rules as JSON when non-empty', async () => {
      const rules = [{ ruleId: 'r-1', name: 'Skip', enabled: true, conditions: { operator: 'any', matchers: [] }, action: { type: 'skip' } }];

      await dao.updateEmailProcessingRulesForUser(mockAppId, 'user@example.com', rules as never);

      expect(fns(mockDb).bindFn).toHaveBeenCalledWith(
        mockAppId,
        'email_processing_rules',
        JSON.stringify(rules),
        mockNow,
        mockNow,
      );
    });

    it('deletes the row when rules are cleared', async () => {
      await dao.updateEmailProcessingRulesForUser(mockAppId, 'user@example.com', []);

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM provider_application_configs'));
    });
  });

  describe('acknowledgeErrorForUser', () => {
    it('acknowledges processing errors via the processing column', async () => {
      await dao.acknowledgeErrorForUser(mockAppId, 'user@example.com', 'processing');

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('last_error_acknowledged_at'));
      expect(fns(mockDb).bindFn).toHaveBeenCalledWith(mockNow, mockNow, mockAppId, 'user@example.com');
    });

    it('acknowledges context errors via the context column', async () => {
      await dao.acknowledgeErrorForUser(mockAppId, 'user@example.com', 'context');

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('context_last_error_acknowledged_at'));
    });
  });
});
