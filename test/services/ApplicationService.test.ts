import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockListMetadataByUserEmail,
  mockCountByUserEmail,
  mockCreate,
  mockGetByIdForUser,
  mockUpdateForUser,
  mockUpdateWatchedFolderIdsForUser,
  mockDeleteForUser,
  mockListActiveVectorIdsForApplication,
  mockMarkDocumentsDeletedByVectorIds,
  mockDeleteAccessToken,
} = vi.hoisted(() => ({
  mockListMetadataByUserEmail: vi.fn(),
  mockCountByUserEmail: vi.fn(),
  mockCreate: vi.fn(),
  mockGetByIdForUser: vi.fn(),
  mockUpdateForUser: vi.fn(),
  mockUpdateWatchedFolderIdsForUser: vi.fn(),
  mockDeleteForUser: vi.fn(),
  mockListActiveVectorIdsForApplication: vi.fn(),
  mockMarkDocumentsDeletedByVectorIds: vi.fn(),
  mockDeleteAccessToken: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return {
      listMetadataByUserEmail: mockListMetadataByUserEmail,
      countByUserEmail: mockCountByUserEmail,
      create: mockCreate,
      getByIdForUser: mockGetByIdForUser,
      updateForUser: mockUpdateForUser,
      updateWatchedFolderIdsForUser: mockUpdateWatchedFolderIdsForUser,
      deleteForUser: mockDeleteForUser,
    };
  }),
  ApplicationContextDAO: vi.fn(function () {
    return {
      listActiveVectorIdsForApplication: mockListActiveVectorIdsForApplication,
      markDocumentsDeletedByVectorIds: mockMarkDocumentsDeletedByVectorIds,
    };
  }),
  OAuth2AccessTokenCacheDAO: vi.fn(function () {
    return { deleteAccessToken: mockDeleteAccessToken };
  }),
}));

vi.mock('@mail-otter/backend-runtime/config', () => ({
  ConfigurationManager: {
    getMaxApplicationsPerUser: vi.fn(() => 99),
  },
}));

vi.mock('../../packages/backend-services/src/application/ApplicationResponseUtil', () => ({
  ApplicationResponseUtil: {
    decorateApplication: vi.fn((app) => ({ ...app, decorated: true })),
  },
}));

import { ApplicationService } from '../../packages/backend-services/src/application/ApplicationService';

function makeEnv(overrides?: Record<string, unknown>) {
  return {
    DB: {} as D1Database,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('key') },
    OAUTH2_TOKEN_CACHE: {} as KVNamespace,
    ...overrides,
  };
}

describe('ApplicationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listUserApplications', () => {
    it('returns decorated applications', async () => {
      mockListMetadataByUserEmail.mockResolvedValue([{ applicationId: 'app-1', userEmail: 'user@example.com' }]);

      const result = await ApplicationService.listUserApplications('user@example.com', makeEnv(), new Request('https://example.com'));

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ applicationId: 'app-1', decorated: true });
    });
  });

  describe('createUserApplication', () => {
    it('creates application within limit', async () => {
      mockCountByUserEmail.mockResolvedValue(0);
      mockCreate.mockResolvedValue({ applicationId: 'new-app' });

      const result = await ApplicationService.createUserApplication(
        'user@example.com',
        { displayName: 'My App', providerId: 'google-gmail', clientId: 'cid', clientSecret: 'cs' },
        makeEnv(),
        new Request('https://example.com'),
      );

      expect(result).toMatchObject({ applicationId: 'new-app', decorated: true });
    });

    it('throws when max applications reached', async () => {
      mockCountByUserEmail.mockResolvedValue(99);

      await expect(
        ApplicationService.createUserApplication(
          'user@example.com',
          { displayName: 'My App', providerId: 'google-gmail', clientId: 'cid', clientSecret: 'cs' },
          makeEnv(),
          new Request('https://example.com'),
        ),
      ).rejects.toThrow('Maximum 99 connected applications allowed per user.');
    });
  });

  describe('updateUserApplication', () => {
    it('updates existing application', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        providerId: 'google-gmail',
        connectionMethod: 'oauth2',
        credentials: { refreshToken: 'rt' },
      });
      mockUpdateForUser.mockResolvedValue({ applicationId: 'app-1' });

      const result = await ApplicationService.updateUserApplication(
        'user@example.com',
        { applicationId: 'app-1', displayName: 'Updated', providerId: 'google-gmail', connectionMethod: 'oauth2', clientId: 'cid', clientSecret: 'cs' },
        makeEnv(),
        new Request('https://example.com'),
      );

      expect(result).toBeDefined();
    });

    it('throws when application not found', async () => {
      mockGetByIdForUser.mockResolvedValue(undefined);

      await expect(
        ApplicationService.updateUserApplication(
          'user@example.com',
          { applicationId: 'nonexistent', displayName: 'X', providerId: 'google-gmail', connectionMethod: 'oauth2', clientId: 'cid', clientSecret: 'cs' },
          makeEnv(),
          new Request('https://example.com'),
        ),
      ).rejects.toThrow('Connected application was not found.');
    });

    it('throws when provider changes', async () => {
      mockGetByIdForUser.mockResolvedValue({
        applicationId: 'app-1',
        providerId: 'google-gmail',
        connectionMethod: 'oauth2',
        credentials: { refreshToken: 'rt' },
      });

      await expect(
        ApplicationService.updateUserApplication(
          'user@example.com',
          { applicationId: 'app-1', displayName: 'X', providerId: 'microsoft-outlook', connectionMethod: 'oauth2', clientId: 'cid', clientSecret: 'cs' },
          makeEnv(),
          new Request('https://example.com'),
        ),
      ).rejects.toThrow('Provider and connection method cannot be changed after creation.');
    });
  });

  describe('updateWatchedFolderIds', () => {
    it('updates and returns application', async () => {
      mockUpdateWatchedFolderIdsForUser.mockResolvedValue({ applicationId: 'app-1' });

      const result = await ApplicationService.updateWatchedFolderIds(
        'user@example.com',
        { applicationId: 'app-1', folderIds: ['INBOX'] },
        makeEnv(),
        new Request('https://example.com'),
      );

      expect(result).toMatchObject({ applicationId: 'app-1', decorated: true });
    });

    it('throws when application not found', async () => {
      mockUpdateWatchedFolderIdsForUser.mockResolvedValue(undefined);

      await expect(
        ApplicationService.updateWatchedFolderIds(
          'user@example.com',
          { applicationId: 'app-1', folderIds: ['INBOX'] },
          makeEnv(),
          new Request('https://example.com'),
        ),
      ).rejects.toThrow('Connected application was not found.');
    });
  });

  describe('deleteUserApplication', () => {
    it('deletes application and context vectors', async () => {
      mockListActiveVectorIdsForApplication.mockResolvedValue(['v1', 'v2']);
      mockDeleteAccessToken.mockResolvedValue(undefined);
      mockDeleteForUser.mockResolvedValue(undefined);

      const env = makeEnv({
        EMAIL_CONTEXT_INDEX: { deleteByIds: vi.fn().mockResolvedValue(undefined) },
      });

      await ApplicationService.deleteUserApplication('user@example.com', 'app-1', env as never);

      expect(mockListActiveVectorIdsForApplication).toHaveBeenCalledWith('app-1', 'user@example.com');
      expect(mockDeleteForUser).toHaveBeenCalledWith('app-1', 'user@example.com');
    });

    it('skips vector index operations when EMAIL_CONTEXT_INDEX is not available', async () => {
      mockListActiveVectorIdsForApplication.mockResolvedValue([]);
      mockDeleteAccessToken.mockResolvedValue(undefined);
      mockDeleteForUser.mockResolvedValue(undefined);

      await ApplicationService.deleteUserApplication('user@example.com', 'app-1', makeEnv() as never);

      expect(mockListActiveVectorIdsForApplication).toHaveBeenCalled();
      expect(mockDeleteForUser).toHaveBeenCalled();
    });
  });
});
