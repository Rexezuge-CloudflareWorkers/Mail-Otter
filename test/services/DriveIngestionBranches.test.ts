import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockUpsertDriveDocument,
  mockGetDocumentSourceInfo,
  mockMarkDocumentIndexed,
  mockMarkDocumentsDeletedByVectorIds,
  mockMarkDocumentError,
  mockInsertAuditLog,
  mockGetUserVectorNamespace,
  mockFingerprint,
  mockEmbed,
  mockRecordEmbeddingUsage,
} = vi.hoisted(() => ({
  mockUpsertDriveDocument: vi.fn(),
  mockGetDocumentSourceInfo: vi.fn(),
  mockMarkDocumentIndexed: vi.fn().mockResolvedValue(undefined),
  mockMarkDocumentsDeletedByVectorIds: vi.fn().mockResolvedValue(undefined),
  mockMarkDocumentError: vi.fn().mockResolvedValue(undefined),
  mockInsertAuditLog: vi.fn().mockResolvedValue(undefined),
  mockGetUserVectorNamespace: vi.fn().mockResolvedValue('ns-user'),
  mockFingerprint: vi.fn().mockResolvedValue('fp-content'),
  mockEmbed: vi.fn().mockResolvedValue([0.1, 0.2]),
  mockRecordEmbeddingUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ApplicationContextDAO: vi.fn(function () {
    return {
      upsertDriveDocument: mockUpsertDriveDocument,
      getDocumentSourceInfo: mockGetDocumentSourceInfo,
      markDocumentIndexed: mockMarkDocumentIndexed,
      markDocumentsDeletedByVectorIds: mockMarkDocumentsDeletedByVectorIds,
      markDocumentError: mockMarkDocumentError,
      insertAuditLog: mockInsertAuditLog,
    };
  }),
  AiDailyUsageDAO: vi.fn(function () {
    return {};
  }),
}));

vi.mock('../../packages/backend-services/src/email/EmailContextUtil', () => ({
  EmailContextUtil: { getUserVectorNamespace: mockGetUserVectorNamespace },
}));

vi.mock('@mail-otter/backend-runtime/config', () => ({
  ConfigurationManager: {
    drive: { getMaxFilesPerSync: vi.fn(() => 20) },
    attachment: { getMaxSizeBytes: vi.fn(() => 1024) },
    getAiEmbeddingModel: vi.fn(() => 'embed-model'),
    getMaxContextMemoryChars: vi.fn(() => 500),
  },
}));

vi.mock('../../packages/backend-services/src/ai/AiClient', () => ({
  AiClient: {
    fingerprint: mockFingerprint,
    embed: mockEmbed,
    truncateMetadata: vi.fn((value: string) => value),
    recordEmbeddingUsage: mockRecordEmbeddingUsage,
  },
}));

import { AbstractDriveIngestionService } from '../../packages/backend-services/src/drive/AbstractDriveIngestionService';
import type { DriveIngestionEnv } from '../../packages/backend-services/src/drive/AbstractDriveIngestionService';
import type { ApplicationContextDAO } from '@mail-otter/backend-data/dao';
import type { ConnectedApplication } from '@mail-otter/shared/model';

class TestDriveService extends AbstractDriveIngestionService {
  constructor(env: DriveIngestionEnv) {
    super(env);
  }

  require(application: ConnectedApplication) {
    return this.requireContext(application);
  }

  ingest(
    application: ConnectedApplication,
    sourceDocumentId: string,
    title: string,
    indexedText: string,
    vectorNamespace: string,
    contextDAO: ApplicationContextDAO,
    sourceType: string,
  ) {
    return this.ingestTextDocument(
      application,
      sourceDocumentId,
      title,
      indexedText,
      vectorNamespace,
      contextDAO,
      sourceType,
      '[Test]',
    );
  }

  deleteDocs(contextDAO: ApplicationContextDAO, application: ConnectedApplication, removedIds: string[]) {
    return this.deleteRemovedDocuments(contextDAO, application, removedIds, 'google_drive', '[Test]');
  }

  indexedText(filename: string, appName: string, rawText: string) {
    return this.buildIndexedText(filename, appName, rawText);
  }

  ingestError(
    contextDAO: ApplicationContextDAO,
    application: ConnectedApplication,
    sourceDocumentId: string,
    error: unknown,
  ) {
    return this.markIngestError(contextDAO, application, sourceDocumentId, 'google_drive', error);
  }
}

function makeApp(): ConnectedApplication {
  return {
    applicationId: 'app-1',
    userEmail: 'user@example.com',
    providerId: 'google-gmail',
    displayName: 'Mailbox',
  } as ConnectedApplication;
}

const VECTORIZE = {
  upsert: vi.fn().mockResolvedValue(undefined),
  deleteByIds: vi.fn().mockResolvedValue(undefined),
};

function makeEnv(extra: Record<string, unknown> = {}): DriveIngestionEnv {
  return {
    DB: {} as never,
    AI: { run: vi.fn() } as unknown as Ai,
    EMAIL_CONTEXT_INDEX: VECTORIZE as unknown as VectorizeIndex,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('secret') },
    ...extra,
  } as unknown as DriveIngestionEnv;
}

function makeDao(): ApplicationContextDAO {
  return {
    upsertDriveDocument: mockUpsertDriveDocument,
    getDocumentSourceInfo: mockGetDocumentSourceInfo,
    markDocumentIndexed: mockMarkDocumentIndexed,
    markDocumentsDeletedByVectorIds: mockMarkDocumentsDeletedByVectorIds,
    markDocumentError: mockMarkDocumentError,
    insertAuditLog: mockInsertAuditLog,
  } as unknown as ApplicationContextDAO;
}

describe('AbstractDriveIngestionService branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocumentSourceInfo.mockResolvedValue(null);
    VECTORIZE.upsert.mockResolvedValue(undefined);
    VECTORIZE.deleteByIds.mockResolvedValue(undefined);
  });

  it('requireContext reports skipped when no Vectorize binding exists', async () => {
    const service = new TestDriveService(makeEnv({ EMAIL_CONTEXT_INDEX: undefined }));
    await expect(service.require(makeApp())).resolves.toEqual({ skipped: true });
    expect(mockGetUserVectorNamespace).not.toHaveBeenCalled();
  });

  it('requireContext resolves namespace and limits when bound', async () => {
    const service = new TestDriveService(makeEnv());
    const result = await service.require(makeApp());
    expect(result).toMatchObject({ skipped: false, vectorNamespace: 'ns-user', maxBytes: 1024, maxFiles: 20 });
  });

  it('buildIndexedText embeds filename and app name', () => {
    const service = new TestDriveService(makeEnv());
    const text = service.indexedText('report.txt', 'Mailbox', 'hello world');
    expect(text).toContain('report.txt');
    expect(text).toContain('Mailbox');
    expect(text).toContain('hello world');
  });

  it('ingestTextDocument skips unchanged documents without embedding', async () => {
    mockUpsertDriveDocument.mockResolvedValue({
      contextDocumentId: 'ctx-1',
      vectorId: 'vec-1',
      contentFingerprint: 'fp-content',
      indexedAt: 123,
    });
    const service = new TestDriveService(makeEnv());
    await expect(service.ingest(makeApp(), 'doc-1', 'Title', 'text', 'ns-user', makeDao(), 'google_drive')).resolves.toBe(
      'skipped',
    );
    expect(VECTORIZE.upsert).not.toHaveBeenCalled();
    expect(mockMarkDocumentIndexed).not.toHaveBeenCalled();
  });

  it('ingestTextDocument indexes new documents end to end', async () => {
    mockUpsertDriveDocument.mockResolvedValue({
      contextDocumentId: 'ctx-2',
      vectorId: 'vec-2',
      contentFingerprint: 'old-fp',
      indexedAt: null,
    });
    const service = new TestDriveService(makeEnv());
    await expect(service.ingest(makeApp(), 'doc-2', 'Title', 'fresh text', 'ns-user', makeDao(), 'google_drive')).resolves.toBe(
      'indexed',
    );
    expect(mockEmbed).toHaveBeenCalled();
    expect(VECTORIZE.upsert).toHaveBeenCalledOnce();
    expect(mockMarkDocumentIndexed).toHaveBeenCalledWith('ctx-2');
    expect(mockInsertAuditLog).toHaveBeenCalledWith(expect.objectContaining({ contextDocumentId: 'ctx-2' }));
    expect(mockRecordEmbeddingUsage).toHaveBeenCalled();
  });

  it('deleteRemovedDocuments removes known files from vectorize and DAO', async () => {
    mockGetDocumentSourceInfo.mockResolvedValue({
      contextDocumentId: 'ctx-3',
      vectorId: 'vec-3',
      userEmail: 'user@example.com',
    });
    const service = new TestDriveService(makeEnv());
    await service.deleteDocs(makeDao(), makeApp(), ['file-1']);
    expect(VECTORIZE.deleteByIds).toHaveBeenCalledWith(['vec-3']);
    expect(mockMarkDocumentsDeletedByVectorIds).toHaveBeenCalledWith('app-1', 'user@example.com', ['vec-3']);
  });

  it('deleteRemovedDocuments ignores unknown files and survives errors', async () => {
    mockGetDocumentSourceInfo.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('db'));
    const service = new TestDriveService(makeEnv());
    await expect(service.deleteDocs(makeDao(), makeApp(), ['unknown', 'broken'])).resolves.toBeUndefined();
    expect(VECTORIZE.deleteByIds).not.toHaveBeenCalled();
  });

  it('markIngestError records failures and swallows lookup errors', async () => {
    mockGetDocumentSourceInfo.mockResolvedValue({
      contextDocumentId: 'ctx-4',
      vectorId: 'vec-4',
      userEmail: 'user@example.com',
    });
    const service = new TestDriveService(makeEnv());
    await service.ingestError(makeDao(), makeApp(), 'doc-9', new Error('extract failed'));
    expect(mockMarkDocumentError).toHaveBeenCalledWith('ctx-4', 'extract failed');

    mockMarkDocumentError.mockClear();
    mockGetDocumentSourceInfo.mockResolvedValue(null);
    await service.ingestError(makeDao(), makeApp(), 'doc-9', 'string failure');
    expect(mockMarkDocumentError).not.toHaveBeenCalled();

    mockGetDocumentSourceInfo.mockRejectedValue(new Error('db'));
    await expect(service.ingestError(makeDao(), makeApp(), 'doc-9', new Error('x'))).resolves.toBeUndefined();
  });
});
