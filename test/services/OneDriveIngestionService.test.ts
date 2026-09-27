import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetProviderConfig,
  mockSetProviderConfig,
  mockDeleteProviderConfig,
  mockUpsertDriveDocument,
  mockGetDocumentSourceInfo,
  mockMarkDocumentIndexed,
  mockMarkDocumentsDeletedByVectorIds,
  mockMarkDocumentError,
  mockInsertAuditLog,
  mockIncrementUsage,
} = vi.hoisted(() => ({
  mockGetProviderConfig: vi.fn(),
  mockSetProviderConfig: vi.fn(),
  mockDeleteProviderConfig: vi.fn(),
  mockUpsertDriveDocument: vi.fn(),
  mockGetDocumentSourceInfo: vi.fn(),
  mockMarkDocumentIndexed: vi.fn(),
  mockMarkDocumentsDeletedByVectorIds: vi.fn(),
  mockMarkDocumentError: vi.fn(),
  mockInsertAuditLog: vi.fn(),
  mockIncrementUsage: vi.fn(),
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
      deleteProviderConfig: mockDeleteProviderConfig,
    };
  }),
  AiDailyUsageDAO: vi.fn(function () {
    return { incrementUsage: mockIncrementUsage };
  }),
}));

const { mockGetDelta, mockDownloadItem, mockConvertItemToPdf } = vi.hoisted(() => ({
  mockGetDelta: vi.fn(),
  mockDownloadItem: vi.fn(),
  mockConvertItemToPdf: vi.fn(),
}));

vi.mock('@mail-otter/provider-clients/onedrive', () => ({
  OneDriveProviderUtil: {
    getDelta: mockGetDelta,
    downloadItem: mockDownloadItem,
    convertItemToPdf: mockConvertItemToPdf,
    isSupportedItem: vi.fn(() => true),
    isOfficeDocument: vi.fn(() => false),
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

vi.mock('@mail-otter/shared/utils', () => ({
  CryptoUtil: {
    hmacSha256Hex: vi.fn(async () => 'mock-fingerprint'),
  },
  UUIDUtil: { getRandomUUID: vi.fn(() => 'mock-uuid') },
  TimestampUtil: { getCurrentUnixTimestampInSeconds: vi.fn(() => 1_000_000) },
}));

vi.mock('../../packages/backend-services/src/email/AiUsageUtil', () => ({
  AiUsageUtil: {
    estimateEmbeddingUsage: vi.fn(() => ({ estimatedNeurons: 100, embeddingTokens: 10 })),
    getCurrentUtcUsageDate: vi.fn(() => '2026-06-26'),
  },
}));

import { OneDriveIngestionService } from '../../packages/backend-services/src/drive/OneDriveIngestionService';

const MOCK_APPLICATION = {
  applicationId: 'app-456',
  userEmail: 'user@example.com',
  displayName: 'Test Outlook Mailbox',
  providerId: 'microsoft-outlook',
  status: 'connected',
} as Parameters<OneDriveIngestionService['ingestForApplication']>[0];

const ACCESS_TOKEN = 'test-access-token';

const MOCK_VECTORIZE = {
  upsert: vi.fn(),
  deleteByIds: vi.fn(),
  query: vi.fn(),
  describe: vi.fn(),
  getByIds: vi.fn(),
};

function makeEnv(extra: Record<string, unknown> = {}) {
  return {
    DB: {} as D1Database,
    AI: { run: vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] })) },
    EMAIL_CONTEXT_INDEX: MOCK_VECTORIZE,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn(async () => 'master-key') },
    ...extra,
  } as ConstructorParameters<typeof OneDriveIngestionService>[0];
}

function service(extra: Record<string, unknown> = {}) {
  return new OneDriveIngestionService(makeEnv(extra));
}

const EMPTY_DELTA = {
  items: [],
  deletedIds: [],
  nextLink: null,
  deltaLink: 'https://graph.microsoft.com/v1.0/me/drive/root/delta?token=new',
};

describe('OneDriveIngestionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserVectorNamespace.mockResolvedValue('ns-user');
    mockSetProviderConfig.mockResolvedValue(undefined);
    mockDeleteProviderConfig.mockResolvedValue(undefined);
    mockMarkDocumentIndexed.mockResolvedValue(undefined);
    mockMarkDocumentsDeletedByVectorIds.mockResolvedValue(undefined);
    mockMarkDocumentError.mockResolvedValue(undefined);
    mockInsertAuditLog.mockResolvedValue(undefined);
    mockIncrementUsage.mockResolvedValue(undefined);
    MOCK_VECTORIZE.upsert.mockResolvedValue(undefined);
    MOCK_VECTORIZE.deleteByIds.mockResolvedValue(undefined);
  });

  it('returns zeros immediately when EMAIL_CONTEXT_INDEX is not bound', async () => {
    const result = await service({ EMAIL_CONTEXT_INDEX: undefined }).ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN);

    expect(result).toEqual({ indexed: 0, skipped: 0, failed: 0, newCursor: null });
    expect(mockGetDelta).not.toHaveBeenCalled();
  });

  it('uses stored delta link when present', async () => {
    const storedLink = 'https://graph.microsoft.com/v1.0/me/drive/root/delta?token=stored';
    mockGetProviderConfig.mockResolvedValue(storedLink);
    mockGetDelta.mockResolvedValue(EMPTY_DELTA);

    await service().ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN);

    expect(mockGetDelta).toHaveBeenCalledWith(ACCESS_TOKEN, storedLink, 20);
  });

  it('uses fresh initial URL when no stored delta link', async () => {
    mockGetProviderConfig.mockResolvedValue(null);
    mockGetDelta.mockResolvedValue(EMPTY_DELTA);

    await service().ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN);

    expect(mockGetDelta).toHaveBeenCalledWith(ACCESS_TOKEN, undefined, 20);
  });

  it('clears stale delta link and retries on 401 with stored link', async () => {
    const storedLink = 'https://graph.microsoft.com/v1.0/drives/stale-id/root/delta?token=old';
    mockGetProviderConfig.mockResolvedValue(storedLink);
    mockGetDelta
      .mockRejectedValueOnce(new Error('Microsoft Graph (OneDrive) get delta failed (401): unauthenticated'))
      .mockResolvedValueOnce(EMPTY_DELTA);

    const result = await service().ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN);

    expect(mockDeleteProviderConfig).toHaveBeenCalledWith(MOCK_APPLICATION.applicationId, 'onedrive_delta_link');
    expect(mockGetDelta).toHaveBeenCalledTimes(2);
    expect(mockGetDelta).toHaveBeenNthCalledWith(2, ACCESS_TOKEN, undefined, 20);
    expect(result.indexed).toBe(0);
  });

  it('re-throws 401 error when there is no stored delta link', async () => {
    mockGetProviderConfig.mockResolvedValue(null);
    mockGetDelta.mockRejectedValue(new Error('Microsoft Graph (OneDrive) get delta failed (401): unauthenticated'));

    await expect(service().ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN)).rejects.toThrow(
      'OneDrive access token lacks the required scope. Re-authorize the application with OneDrive permissions enabled.',
    );

    expect(mockDeleteProviderConfig).not.toHaveBeenCalled();
    expect(mockGetDelta).toHaveBeenCalledTimes(1);
  });

  it('re-throws non-401 provider errors without clearing delta link', async () => {
    const storedLink = 'https://graph.microsoft.com/v1.0/me/drive/root/delta?token=ok';
    mockGetProviderConfig.mockResolvedValue(storedLink);
    mockGetDelta.mockRejectedValue(new Error('Microsoft Graph (OneDrive) get delta failed (503): Service Unavailable'));

    await expect(service().ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN)).rejects.toThrow('(503)');

    expect(mockDeleteProviderConfig).not.toHaveBeenCalled();
    expect(mockGetDelta).toHaveBeenCalledTimes(1);
  });

  it('saves new cursor after successful delta', async () => {
    mockGetProviderConfig.mockResolvedValue(null);
    mockGetDelta.mockResolvedValue(EMPTY_DELTA);

    await service().ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN);

    expect(mockSetProviderConfig).toHaveBeenCalledWith(MOCK_APPLICATION.applicationId, 'onedrive_delta_link', EMPTY_DELTA.deltaLink);
  });

  it('indexes a plain text file from delta', async () => {
    mockGetProviderConfig.mockResolvedValue(null);
    const textBuffer = new TextEncoder().encode('Hello OneDrive content').buffer;
    mockGetDelta.mockResolvedValue({
      items: [
        {
          id: 'file-1',
          name: 'notes.txt',
          size: 100,
          file: { mimeType: 'text/plain' },
          '@microsoft.graph.downloadUrl': 'https://cdn.example.com/notes.txt',
        },
      ],
      deletedIds: [],
      nextLink: null,
      deltaLink: 'https://graph.microsoft.com/v1.0/me/drive/root/delta?token=after',
    });
    mockDownloadItem.mockResolvedValue(textBuffer);
    mockUpsertDriveDocument.mockResolvedValue({
      contextDocumentId: 'ctx-1',
      vectorId: 'vec-1',
      contentFingerprint: 'different',
      indexedAt: null,
    });

    const result = await service().ingestForApplication(MOCK_APPLICATION, ACCESS_TOKEN);

    expect(mockDownloadItem).toHaveBeenCalledWith('https://cdn.example.com/notes.txt', 2_097_152);
    expect(MOCK_VECTORIZE.upsert).toHaveBeenCalledOnce();
    expect(mockMarkDocumentIndexed).toHaveBeenCalledWith('ctx-1');
    expect(result.indexed).toBe(1);
    expect(result.skipped).toBe(0);
  });
});
