import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mail-otter/shared/utils', () => ({
  TimestampUtil: { getCurrentUnixTimestampInSeconds: vi.fn(() => 1_778_200_000) },
  UUIDUtil: { getRandomUUID: vi.fn(() => 'doc-uuid-1') },
}));

import { ApplicationContextDAO } from '@mail-otter/backend-data/dao';
import type { ApplicationContextDocumentInternal, ApplicationContextDeletionRunInternal, ContextAuditLogInternal } from '@mail-otter/shared/model';
import type { D1Result } from '@mail-otter/shared/constants';

function makeDb(fns: {
  run?: ReturnType<typeof vi.fn>;
  first?: ReturnType<typeof vi.fn>;
  all?: ReturnType<typeof vi.fn>;
}): D1Database {
  const runFn = fns.run ?? vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
  const firstFn = fns.first ?? vi.fn().mockResolvedValue(null);
  const allFn = fns.all ?? vi.fn().mockResolvedValue({ results: [] } as D1Result);
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
    })),
  };
}

function createDocRow(overrides?: Partial<ApplicationContextDocumentInternal>): ApplicationContextDocumentInternal {
  return {
    context_document_id: 'doc-1',
    application_id: 'app-1',
    user_email: 'user@example.com',
    source_type: 'email',
    source_provider_id: 'google-gmail',
    source_document_id: 'src-1',
    source_thread_id: null,
    vector_namespace: 'ns1',
    vector_id: 'cd_doc-1',
    source_document_fingerprint: 'fp1',
    source_thread_fingerprint: null,
    title_fingerprint: null,
    sender_fingerprint: null,
    content_fingerprint: 'cfp1',
    indexed_text_chars: 100,
    status: 'active',
    indexed_at: null,
    deleted_at: null,
    last_error: null,
    created_at: 1_778_200_000,
    updated_at: 1_778_200_000,
    ...overrides,
  };
}

function createDeletionRunRow(overrides?: Partial<ApplicationContextDeletionRunInternal>): ApplicationContextDeletionRunInternal {
  return {
    deletion_run_id: 'del-1',
    application_id: 'app-1',
    user_email: 'user@example.com',
    vector_namespace: 'ns1',
    requested_vector_count: 10,
    deleted_vector_count: 10,
    mutation_ids: '["m1","m2"]',
    status: 'accepted',
    error_message: null,
    created_at: 1_778_200_000,
    updated_at: 1_778_200_000,
    ...overrides,
  };
}

function createAuditLogRow(overrides?: Partial<ContextAuditLogInternal>): ContextAuditLogInternal {
  return {
    id: 'log-1',
    context_document_id: 'doc-1',
    application_id: 'app-1',
    user_email: 'user@example.com',
    source_document_id: 'src-1',
    event_type: 'indexed',
    event_label: null,
    event_data: null,
    severity: 'info',
    created_at: 1_778_200_000,
    ...overrides,
  };
}

describe('ApplicationContextDAO', () => {
  let dao: ApplicationContextDAO;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertEmailDocument', () => {
    it('inserts new document when no existing', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const firstFn = vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createDocRow());
      const db = makeDb({ run: runFn, first: firstFn });
      dao = new ApplicationContextDAO(db);

      const result = await dao.upsertEmailDocument({
        applicationId: 'app-1',
        userEmail: 'user@example.com',
        sourceProviderId: 'google-gmail',
        sourceDocumentId: 'src-1',
        vectorNamespace: 'ns1',
        sourceDocumentFingerprint: 'fp1',
        contentFingerprint: 'cfp1',
        indexedTextChars: 100,
      });

      expect(result.contextDocumentId).toBe('doc-1');
    });

    it('updates existing document when found', async () => {
      const existing = createDocRow();
      const updated = createDocRow({ indexed_text_chars: 200 });
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const firstFn = vi.fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(updated);
      const db = makeDb({ run: runFn, first: firstFn });
      dao = new ApplicationContextDAO(db);

      const result = await dao.upsertEmailDocument({
        applicationId: 'app-1',
        userEmail: 'user@example.com',
        sourceProviderId: 'google-gmail',
        sourceDocumentId: 'src-1',
        vectorNamespace: 'ns1',
        sourceDocumentFingerprint: 'fp1',
        contentFingerprint: 'cfp1',
        indexedTextChars: 200,
      });

      expect(result.indexedTextChars).toBe(200);
    });
  });

  describe('markDocumentIndexed / markDocumentError', () => {
    it('marks document as indexed', async () => {
      const db = makeDb({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result) });
      dao = new ApplicationContextDAO(db);
      await dao.markDocumentIndexed('doc-1');
    });

    it('marks document as error', async () => {
      const db = makeDb({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result) });
      dao = new ApplicationContextDAO(db);
      await dao.markDocumentError('doc-1', 'error message');
    });
  });

  describe('getSummaryByApplication', () => {
    it('returns summary with counts', async () => {
      const firstFn = vi.fn()
        .mockResolvedValueOnce({ count: 5, last_indexed_at: 1_778_200_000 })
        .mockResolvedValueOnce({ last_delete_accepted_at: 1_778_100_000 });
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      const db = makeDb({ first: firstFn, all: allFn });
      dao = new ApplicationContextDAO(db);

      const result = await dao.getSummaryByApplication('app-1');
      expect(result.documentCount).toBe(5);
      expect(result.lastIndexedAt).toBe(1_778_200_000);
    });

    it('handles null values', async () => {
      const firstFn = vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      const db = makeDb({ first: firstFn, all: allFn });
      dao = new ApplicationContextDAO(db);

      const result = await dao.getSummaryByApplication('app-1');
      expect(result.documentCount).toBe(0);
      expect(result.lastIndexedAt).toBeNull();
    });

    it('reports last error from documents', async () => {
      const firstFn = vi.fn()
        .mockResolvedValueOnce({ count: 5, last_indexed_at: 1_778_200_000 })
        .mockResolvedValueOnce({ last_delete_accepted_at: null })
        .mockResolvedValueOnce({ last_error: 'doc error', updated_at: 1_778_200_000 })
        .mockResolvedValueOnce(null);
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      const db = makeDb({ first: firstFn, all: allFn });
      dao = new ApplicationContextDAO(db);

      const result = await dao.getSummaryByApplication('app-1');
      expect(result.lastError).toBe('doc error');
    });
  });

  describe('listDocumentsForUser', () => {
    it('returns paginated documents', async () => {
      const rows = [createDocRow(), createDocRow({ context_document_id: 'doc-2' })];
      const db = makeDb({ all: vi.fn().mockResolvedValue({ results: rows } as D1Result) });
      dao = new ApplicationContextDAO(db);

      const result = await dao.listDocumentsForUser('user@example.com', { limit: 1 });
      expect(result.documents).toHaveLength(1);
      expect(result.nextCursor).toBeDefined();
    });

    it('filters by application and status', async () => {
      const db = makeDb({ all: vi.fn().mockResolvedValue({ results: [] } as D1Result) });
      dao = new ApplicationContextDAO(db);

      const result = await dao.listDocumentsForUser('user@example.com', {
        applicationId: 'app-1',
        status: 'active',
      });
      expect(result.documents).toEqual([]);
    });

    it('handles cursor pagination', async () => {
      const cursor = btoa(JSON.stringify([1_778_200_000, 1_778_200_000]));
      const db = makeDb({ all: vi.fn().mockResolvedValue({ results: [] } as D1Result) });
      dao = new ApplicationContextDAO(db);

      await dao.listDocumentsForUser('user@example.com', { cursor });
    });
  });

  describe('listDeletionRunsForUser', () => {
    it('returns paginated deletion runs', async () => {
      const rows = [createDeletionRunRow(), createDeletionRunRow({ deletion_run_id: 'del-2' })];
      const db = makeDb({ all: vi.fn().mockResolvedValue({ results: rows } as D1Result) });
      dao = new ApplicationContextDAO(db);

      const result = await dao.listDeletionRunsForUser('user@example.com', { limit: 1 });
      expect(result.deletionRuns).toHaveLength(1);
      expect(result.nextCursor).toBeDefined();
    });
  });

  describe('getDocumentSourceForUser', () => {
    it('returns source info when found', async () => {
      const row = { context_document_id: 'doc-1', application_id: 'app-1', user_email: 'user@example.com', source_provider_id: 'google-gmail', source_document_id: 'src-1', source_thread_id: null, status: 'active' };
      const db = makeDb({ first: vi.fn().mockResolvedValue(row) });
      dao = new ApplicationContextDAO(db);

      const result = await dao.getDocumentSourceForUser('doc-1', 'user@example.com');
      expect(result?.contextDocumentId).toBe('doc-1');
    });

    it('returns undefined when not found', async () => {
      const db = makeDb({});
      dao = new ApplicationContextDAO(db);

      const result = await dao.getDocumentSourceForUser('nonexistent', 'user@example.com');
      expect(result).toBeUndefined();
    });
  });

  describe('listActiveVectorIdsForApplication', () => {
    it('returns vector IDs', async () => {
      const db = makeDb({ all: vi.fn().mockResolvedValue({ results: [{ vector_id: 'v1' }, { vector_id: 'v2' }] } as D1Result) });
      dao = new ApplicationContextDAO(db);

      const result = await dao.listActiveVectorIdsForApplication('app-1', 'user@example.com');
      expect(result).toEqual(['v1', 'v2']);
    });
  });

  describe('recordDeletionRun', () => {
    it('records and returns deletion run', async () => {
      const row = createDeletionRunRow();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const firstFn = vi.fn().mockResolvedValue(row);
      const allFn = vi.fn().mockResolvedValue({ results: [] } as D1Result);
      const db = makeDb({ run: runFn, first: firstFn, all: allFn });
      dao = new ApplicationContextDAO(db);

      const result = await dao.recordDeletionRun({
        applicationId: 'app-1',
        userEmail: 'user@example.com',
        vectorNamespace: 'ns1',
        requestedVectorCount: 10,
        deletedVectorCount: 10,
        mutationIds: ['m1', 'm2'],
        status: 'accepted',
      });

      expect(result.deletionRunId).toBe('del-1');
    });
  });

  describe('deleteStaleDeletedDocuments / deleteStaleErrorDocuments', () => {
    it('deletes stale deleted documents', async () => {
      const db = makeDb({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 3 } } as D1Result) });
      dao = new ApplicationContextDAO(db);

      const result = await dao.deleteStaleDeletedDocuments(1_778_000_000, 100);
      expect(result).toBe(3);
    });

    it('deletes stale error documents', async () => {
      const db = makeDb({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 2 } } as D1Result) });
      dao = new ApplicationContextDAO(db);

      const result = await dao.deleteStaleErrorDocuments(1_778_000_000, 100);
      expect(result).toBe(2);
    });
  });

  describe('insertAuditLog / insertAuditLogs', () => {
    it('inserts single audit log', async () => {
      const db = makeDb({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result) });
      dao = new ApplicationContextDAO(db);

      await dao.insertAuditLog({
        contextDocumentId: 'doc-1',
        applicationId: 'app-1',
        userEmail: 'user@example.com',
        eventType: 'indexed',
        severity: 'info',
      });
    });

    it('batch inserts audit logs', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 2 } } as D1Result);
      const db = makeDb({ run: runFn });
      dao = new ApplicationContextDAO(db);

      await dao.insertAuditLogs([
        { contextDocumentId: 'doc-1', applicationId: 'app-1', userEmail: 'user@example.com', eventType: 'indexed', severity: 'info' },
        { contextDocumentId: 'doc-2', applicationId: 'app-1', userEmail: 'user@example.com', eventType: 'deleted', severity: 'warn' },
      ]);
    });
  });

  describe('listAuditLogs', () => {
    it('returns paginated audit logs', async () => {
      const rows = [createAuditLogRow()];
      const db = makeDb({ all: vi.fn().mockResolvedValue({ results: rows } as D1Result) });
      dao = new ApplicationContextDAO(db);

      const result = await dao.listAuditLogs('doc-1');
      expect(result.logs).toHaveLength(1);
    });

    it('handles cursor pagination', async () => {
      const cursor = btoa(JSON.stringify([1_778_200_000]));
      const db = makeDb({ all: vi.fn().mockResolvedValue({ results: [] } as D1Result) });
      dao = new ApplicationContextDAO(db);

      await dao.listAuditLogs('doc-1', { cursor });
    });
  });

  describe('deleteOldAuditLogs / deleteOldDeletionRuns', () => {
    it('deletes old audit logs', async () => {
      const db = makeDb({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 5 } } as D1Result) });
      dao = new ApplicationContextDAO(db);

      const result = await dao.deleteOldAuditLogs(1_778_000_000, 100);
      expect(result).toBe(5);
    });

    it('deletes old deletion runs', async () => {
      const db = makeDb({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 3 } } as D1Result) });
      dao = new ApplicationContextDAO(db);

      const result = await dao.deleteOldDeletionRuns(1_778_000_000, 100);
      expect(result).toBe(3);
    });
  });

  describe('listApplicationsOverDocumentLimit', () => {
    it('returns over-limit applications', async () => {
      const allFn = vi.fn().mockResolvedValue({
        results: [
          { application_id: 'app-1', user_email: 'user@example.com', active_count: 50, effective_limit: 25 },
        ],
      } as D1Result);
      const db = makeDb({ all: allFn });
      dao = new ApplicationContextDAO(db);

      const result = await dao.listApplicationsOverDocumentLimit(25);
      expect(result).toHaveLength(1);
      expect(result[0].applicationId).toBe('app-1');
    });
  });

  describe('listOldestActiveVectorIdsForApplication', () => {
    it('returns oldest vector IDs', async () => {
      const allFn = vi.fn().mockResolvedValue({
        results: [{ vector_id: 'cd_v1' }, { vector_id: 'cd_v2' }],
      } as D1Result);
      const db = makeDb({ all: allFn });
      dao = new ApplicationContextDAO(db);

      const result = await dao.listOldestActiveVectorIdsForApplication('app-1', 'user@example.com', 2);
      expect(result).toEqual(['cd_v1', 'cd_v2']);
    });
  });

  describe('getDocumentSourcesByVectorIds', () => {
    it('returns document sources for vector IDs', async () => {
      const allFn = vi.fn().mockResolvedValue({
        results: [
          { context_document_id: 'doc-1', source_document_id: 'src-1' },
        ],
      } as D1Result);
      const db = makeDb({ all: allFn });
      dao = new ApplicationContextDAO(db);

      const result = await dao.getDocumentSourcesByVectorIds('app-1', 'user@example.com', ['cd_doc-1']);
      expect(result).toHaveLength(1);
      expect(result[0].contextDocumentId).toBe('doc-1');
    });

    it('returns empty when no vector IDs provided', async () => {
      const db = makeDb({});
      dao = new ApplicationContextDAO(db);

      const result = await dao.getDocumentSourcesByVectorIds('app-1', 'user@example.com', []);
      expect(result).toEqual([]);
    });
  });

  describe('markDocumentsDeletedByVectorIds', () => {
    it('marks documents as deleted', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const db = makeDb({ run: runFn });
      dao = new ApplicationContextDAO(db);

      await dao.markDocumentsDeletedByVectorIds('app-1', 'user@example.com', ['cd_doc-1']);
    });

    it('does nothing when no vector IDs', async () => {
      const db = makeDb({});
      dao = new ApplicationContextDAO(db);

      await dao.markDocumentsDeletedByVectorIds('app-1', 'user@example.com', []);
    });
  });

  describe('getContextDocumentIdBySource', () => {
    it('returns document ID when found', async () => {
      const firstFn = vi.fn().mockResolvedValue({ context_document_id: 'doc-1' });
      const db = makeDb({ first: firstFn });
      dao = new ApplicationContextDAO(db);

      const result = await dao.getContextDocumentIdBySource('app-1', 'src-1', 'email');
      expect(result).toBe('doc-1');
    });

    it('returns undefined when not found', async () => {
      const db = makeDb({});
      dao = new ApplicationContextDAO(db);

      const result = await dao.getContextDocumentIdBySource('app-1', 'nonexistent', 'email');
      expect(result).toBeUndefined();
    });
  });
});
