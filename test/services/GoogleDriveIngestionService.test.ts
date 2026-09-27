import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetProviderConfig,
  mockSetProviderConfig,
  mockUpsertDriveDocument,
  mockGetDocumentSourceInfo,
  mockMarkDocumentIndexed,
  mockMarkDocumentsDeletedByVectorIds,
  mockMarkDocumentError,
  mockInsertAuditLog,
  mockIncrementUsage,
  mockListApplicationIdsWithFeatureEnabled,
} = vi.hoisted(() => ({
  mockGetProviderConfig: vi.fn(),
  mockSetProviderConfig: vi.fn(),
  mockUpsertDriveDocument: vi.fn(),
  mockGetDocumentSourceInfo: vi.fn(),
  mockMarkDocumentIndexed: vi.fn(),
  mockMarkDocumentsDeletedByVectorIds: vi.fn(),
  mockMarkDocumentError: vi.fn(),
  mockInsertAuditLog: vi.fn(),
  mockIncrementUsage: vi.fn(),
  mockListApplicationIdsWithFeatureEnabled: vi.fn(),
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
  ConnectedApplicationDAO: vi.fn(function () {
    return {
      getProviderConfig: mockGetProviderConfig,
      setProviderConfig: mockSetProviderConfig,
      listApplicationIdsWithFeatureEnabled: mockListApplicationIdsWithFeatureEnabled,
    };
  }),
  AiDailyUsageDAO: vi.fn(function () {
    return { incrementUsage: mockIncrementUsage };
  }),
}));

const { mockGetStartPageToken, mockListChanges, mockExportDocument, mockDownloadFile, mockIsExportableMimeType } = vi.hoisted(() => ({
  mockGetStartPageToken: vi.fn(),
  mockListChanges: vi.fn(),
  mockExportDocument: vi.fn(),
  mockDownloadFile: vi.fn(),
  mockIsExportableMimeType: vi.fn(),
}));

vi.mock('@mail-otter/provider-clients/google-drive', () => ({
  GoogleDriveProviderUtil: {
    getStartPageToken: mockGetStartPageToken,
    listChanges: mockListChanges,
    exportDocument: mockExportDocument,
    downloadFile: mockDownloadFile,
    isExportableMimeType: mockIsExportableMimeType,
    isSupportedMimeType: vi.fn(() => true),
  },
}));

const { mockGetUserVectorNamespace } = vi.hoisted(() => ({
  mockGetUserVectorNamespace: vi.fn(),
}));

vi.mock('../../packages/backend-services/src/email/EmailContextUtil', () => ({
  EmailContextUtil: {
    getUserVectorNamespace: mockGetUserVectorNamespace,
  },
}));

vi.mock('@mail-otter/backend-runtime/config', () => ({
  ConfigurationManager: {
    drive: { getMaxFilesPerSync: vi.fn(() => 20) },
    attachment: { getMaxSizeBytes: vi.fn(() => 2_097_152) },
    getAiEmbeddingModel: vi.fn(() => '@cf/baai/bge-base-en-v1.5'),
    getMaxContextMemoryChars: vi.fn(() => 10_000),
  },
}));

// Partial mock: only the three deterministic helpers are stubbed. Spreading the
// real module keeps unrelated exports (e.g. `logError`) available, so adding a
// new export to `shared/utils` cannot break this suite.
vi.mock('@mail-otter/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mail-otter/shared/utils')>();
  return {
    ...actual,
    CryptoUtil: {
      hmacSha256Hex: vi.fn(async (_msg: string, _key: string) => 'mock-fingerprint'),
    },
    UUIDUtil: { getRandomUUID: vi.fn(() => 'mock-uuid') },
    TimestampUtil: { getCurrentUnixTimestampInSeconds: vi.fn(() => 1_000_000) },
  };
});

vi.mock('../../packages/backend-services/src/email/AiUsageUtil', () => ({
  AiUsageUtil: {
    estimateEmbeddingUsage: vi.fn(() => ({ estimatedNeurons: 100, embeddingTokens: 10 })),
    getCurrentUtcUsageDate: vi.fn(() => '2026-06-25'),
  },
}));

import { GoogleDriveIngestionService } from '../../packages/backend-services/src/drive/GoogleDriveIngestionService';

const MOCK_APPLICATION = {
  applicationId: 'app-123',
  userEmail: 'user@example.com',
  displayName: 'Test Mailbox',
  providerId: 'google-gmail',
  status: 'connected',
} as Parameters<GoogleDriveIngestionService['ingestForApplication']>[0];

const ACCESS_TOKEN = 'test-token';

const MOCK_VECTORIZE = {
  upsert: vi.fn(),
  deleteByIds: vi.fn(),
  query: vi.fn(),
  describe: vi.fn(),
  getByIds: vi.fn(),
};

function makeEnv(
  extra: Record<string, unknown> = {},
): Parameters<typeof GoogleDriveIngestionService.prototype.ingestForApplication>[0] extends never
  ? never
  : ConstructorParameters<typeof GoogleDriveIngestionService>[0] {
  return {
    DB: {} as Parameters<typeof GoogleDriveIngestionService.prototype.ingestForApplication>[0],
    AI: { run: vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] })) } as unknown as Ai,
    EMAIL_CONTEXT_INDEX: MOCK_VECTORIZE as unknown as VectorizeIndex,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn(async () => 'master-key') },
    ...extra,
  } as unknown as ConstructorParameters<typeof GoogleDriveIngestionService>[0];
}

describe('GoogleDriveIngestionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserVectorNamespace.mockResolvedValue('ns-user');
    mockSetProviderConfig.mockResolvedValue(undefined);
    mockMarkDocumentIndexed.mockResolvedValue(undefined);
    mockMarkDocumentsDeletedByVectorIds.mockResolvedValue(undefined);
    mockMarkDocumentError.mockResolvedValue(undefined);
    mockInsertAuditLog.mockResolvedValue(undefined);
    mockIncrementUsage.mockResolvedValue(undefined);
    MOCK_VECTORIZE.upsert.mockResolvedValue(undefined);
    MOCK_VECTORIZE.deleteByIds.mockResolvedValue(undefined);
  });

  it('returns zeros immediately when EMAIL_CONTEXT_INDEX is not bound', async () => {
    const service = new GoogleDriveIngestionService({ ...makeEnv(), EMAIL_CONTEXT_INDEX: undefined });
    const result = await service.ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN);

    expect(result).toEqual({ indexed: 0, skipped: 0, failed: 0, newCursor: null });
    expect(mockListChanges).not.toHaveBeenCalled();
  });

  it('initializes cursor on first run and returns without indexing', async () => {
    mockGetProviderConfig.mockResolvedValue(null);
    mockGetStartPageToken.mockResolvedValue('first-token');

    const result = await service().ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN);

    expect(mockGetStartPageToken).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(mockSetProviderConfig).toHaveBeenCalledWith(MOCK_APPLICATION.applicationId, 'google_drive_page_token', 'first-token');
    expect(result).toEqual({ indexed: 0, skipped: 0, failed: 0, newCursor: null });
    expect(mockListChanges).not.toHaveBeenCalled();
  });

  it('exports and indexes a Google Docs file', async () => {
    mockGetProviderConfig.mockResolvedValue('existing-page-token');
    mockListChanges.mockResolvedValue({
      files: [{ id: 'doc-id', name: 'Report.gdoc', mimeType: 'application/vnd.google-apps.document' }],
      removed: [],
      nextPageToken: null,
      newStartPageToken: 'new-page-token',
    });
    mockIsExportableMimeType.mockReturnValue(true);
    mockExportDocument.mockResolvedValue('Hello world document content');
    mockUpsertDriveDocument.mockResolvedValue({
      contextDocumentId: 'ctx-1',
      vectorId: 'vec-1',
      contentFingerprint: 'different-fp',
      indexedAt: null,
    });

    const result = await service().ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN);

    expect(mockExportDocument).toHaveBeenCalledWith(ACCESS_TOKEN, 'doc-id');
    expect(MOCK_VECTORIZE.upsert).toHaveBeenCalledOnce();
    expect(mockMarkDocumentIndexed).toHaveBeenCalledWith('ctx-1');
    expect(mockSetProviderConfig).toHaveBeenCalledWith(MOCK_APPLICATION.applicationId, 'google_drive_page_token', 'new-page-token');
    expect(result.indexed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.newCursor).toBe('new-page-token');
  });

  it('skips a file that is already indexed with the same content fingerprint', async () => {
    mockGetProviderConfig.mockResolvedValue('token-123');
    mockListChanges.mockResolvedValue({
      files: [{ id: 'doc-id', name: 'Unchanged.txt', mimeType: 'text/plain' }],
      removed: [],
      nextPageToken: null,
      newStartPageToken: 'tok-next',
    });
    mockIsExportableMimeType.mockReturnValue(false);
    mockDownloadFile.mockResolvedValue(new TextEncoder().encode('text content').buffer);
    mockUpsertDriveDocument.mockResolvedValue({
      contextDocumentId: 'ctx-2',
      vectorId: 'vec-2',
      contentFingerprint: 'mock-fingerprint',
      indexedAt: 1_000_000,
    });

    const result = await service().ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN);

    expect(MOCK_VECTORIZE.upsert).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.indexed).toBe(0);
  });

  it('handles deleted file by removing from vectorize and DAO', async () => {
    mockGetProviderConfig.mockResolvedValue('tok');
    mockListChanges.mockResolvedValue({
      files: [],
      removed: ['removed-file-id'],
      nextPageToken: null,
      newStartPageToken: 'tok2',
    });
    mockGetDocumentSourceInfo.mockResolvedValue({
      contextDocumentId: 'ctx-3',
      vectorId: 'vec-3',
      userEmail: 'user@example.com',
    });

    await service().ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN);

    expect(MOCK_VECTORIZE.deleteByIds).toHaveBeenCalledWith(['vec-3']);
    expect(mockMarkDocumentsDeletedByVectorIds).toHaveBeenCalledWith(MOCK_APPLICATION.applicationId, 'user@example.com', ['vec-3']);
  });

  it('counts failed files but continues processing remaining files', async () => {
    mockGetProviderConfig.mockResolvedValue('tok');
    mockListChanges.mockResolvedValue({
      files: [
        { id: 'bad-file', name: 'Error.txt', mimeType: 'text/plain' },
        { id: 'good-file', name: 'Ok.txt', mimeType: 'text/plain' },
      ],
      removed: [],
      nextPageToken: null,
      newStartPageToken: 'new-tok',
    });
    mockIsExportableMimeType.mockReturnValue(false);
    mockDownloadFile
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(new TextEncoder().encode('good content').buffer);
    mockUpsertDriveDocument.mockResolvedValue({
      contextDocumentId: 'ctx-ok',
      vectorId: 'vec-ok',
      contentFingerprint: 'new-fp',
      indexedAt: null,
    });

    const result = await service().ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN);

    expect(result.failed).toBe(1);
    expect(result.indexed).toBe(1);
  });
});

function service(): GoogleDriveIngestionService {
  return new GoogleDriveIngestionService(makeEnv());
}
