import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetByIdForUser,
  mockUpdateForUser,
  mockUpdateWatchedFolderIdsForUser,
  mockDeleteForUser,
  mockGetMetadataByIdForUser,
  mockUpdateEmailProcessingRulesForUser,
  mockAcknowledgeErrorForUser,
  mockListActiveVectorIds,
  mockMarkDocumentsDeleted,
  mockDeleteAccessToken,
  mockListByApplicationId,
  mockCreateIntegration,
  mockGetIntegrationByIdForUser,
  mockUpdateIntegration,
  mockDeleteIntegrationById,
  mockListLogsByIntegrationId,
  mockSendTestNotification,
  mockStopWatch,
  mockGetAccessToken,
  mockSuggestWithUsage,
  mockIncrementUsage,
  mockGetEmailSummaryModel,
} = vi.hoisted(() => ({
  mockGetByIdForUser: vi.fn(),
  mockUpdateForUser: vi.fn(),
  mockUpdateWatchedFolderIdsForUser: vi.fn(),
  mockDeleteForUser: vi.fn(),
  mockGetMetadataByIdForUser: vi.fn(),
  mockUpdateEmailProcessingRulesForUser: vi.fn(),
  mockAcknowledgeErrorForUser: vi.fn(),
  mockListActiveVectorIds: vi.fn().mockResolvedValue([]),
  mockMarkDocumentsDeleted: vi.fn(),
  mockDeleteAccessToken: vi.fn(),
  mockListByApplicationId: vi.fn().mockResolvedValue([]),
  mockCreateIntegration: vi.fn(),
  mockGetIntegrationByIdForUser: vi.fn(),
  mockUpdateIntegration: vi.fn(),
  mockDeleteIntegrationById: vi.fn(),
  mockListLogsByIntegrationId: vi.fn().mockResolvedValue([]),
  mockSendTestNotification: vi.fn(),
  mockStopWatch: vi.fn(),
  mockGetAccessToken: vi.fn().mockResolvedValue('tok'),
  mockSuggestWithUsage: vi.fn(),
  mockIncrementUsage: vi.fn(),
  mockGetEmailSummaryModel: vi.fn(() => 'model'),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return {
      getByIdForUser: mockGetByIdForUser,
      updateForUser: mockUpdateForUser,
      updateWatchedFolderIdsForUser: mockUpdateWatchedFolderIdsForUser,
      deleteForUser: mockDeleteForUser,
      getMetadataByIdForUser: mockGetMetadataByIdForUser,
      updateEmailProcessingRulesForUser: mockUpdateEmailProcessingRulesForUser,
      acknowledgeErrorForUser: mockAcknowledgeErrorForUser,
    };
  }),
  ApplicationContextDAO: vi.fn(function () {
    return {
      listActiveVectorIdsForApplication: mockListActiveVectorIds,
      markDocumentsDeletedByVectorIds: mockMarkDocumentsDeleted,
    };
  }),
  OAuth2AccessTokenCacheDAO: vi.fn(function () {
    return { deleteAccessToken: mockDeleteAccessToken };
  }),
  ApplicationIntegrationDAO: vi.fn(function () {
    return {
      listByApplicationId: mockListByApplicationId,
      create: mockCreateIntegration,
      getByIdForUser: mockGetIntegrationByIdForUser,
      update: mockUpdateIntegration,
      deleteById: mockDeleteIntegrationById,
    };
  }),
  IntegrationDeliveryLogDAO: vi.fn(function () {
    return { listByIntegrationId: mockListLogsByIntegrationId };
  }),
  AiDailyUsageDAO: vi.fn(function () {
    return { incrementUsage: mockIncrementUsage };
  }),
}));

vi.mock('@mail-otter/backend-services/subscription', () => ({
  WatchService: vi.fn(function () {
    return { stopApplicationWatch: mockStopWatch };
  }),
}));

vi.mock('../../packages/backend-services/src/integration/IntegrationService', () => ({
  IntegrationService: vi.fn(function () {
    return { sendTestNotification: mockSendTestNotification };
  }),
}));

vi.mock('@mail-otter/backend-services/oauth2', () => ({
  OAuth2AccessTokenService: vi.fn(function () {
    return { getAccessToken: mockGetAccessToken };
  }),
}));

vi.mock('@mail-otter/backend-services/provider', () => ({
  EmailProviderRegistry: { get: vi.fn(() => ({})) },
}));

vi.mock('../../packages/backend-services/src/email/EmailRuleSuggestionUtil', () => ({
  EmailRuleSuggestionUtil: { suggestWithUsage: (...args: unknown[]) => mockSuggestWithUsage(...args) },
}));

vi.mock('@mail-otter/backend-runtime/config', () => ({
  ConfigurationManager: { getEmailSummaryModel: (...args: unknown[]) => mockGetEmailSummaryModel(...args) },
}));

vi.mock('../../packages/backend-services/src/application/ApplicationResponseUtil', () => ({
  ApplicationResponseUtil: { decorateApplication: vi.fn((app) => ({ ...app, decorated: true })) },
}));

import { ApplicationService } from '../../packages/backend-services/src/application/ApplicationService';
import { BadRequestError, NotFoundError } from '@mail-otter/backend-errors';

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: {},
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('key') },
    ...overrides,
  } as never;
}

const oauthApp = {
  applicationId: 'app-1',
  providerId: 'google-gmail',
  connectionMethod: 'oauth2',
  status: 'connected',
  credentials: { clientId: 'cid', clientSecret: 'cs' },
  enabledFeatures: [],
};

describe('ApplicationService branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMetadataByIdForUser.mockResolvedValue({ applicationId: 'app-1' });
  });

  it('updateUserApplication throws NotFound when missing, BadRequest on provider change', async () => {
    mockGetByIdForUser.mockResolvedValue(undefined);
    const svc = new ApplicationService(makeEnv());
    await expect(
      svc.updateUserApplication('u@x', { applicationId: 'a', providerId: 'google-gmail', connectionMethod: 'oauth2', displayName: 'd' } as never, new Request('https://x')),
    ).rejects.toThrow(NotFoundError);
    mockGetByIdForUser.mockResolvedValue({ ...oauthApp, providerId: 'microsoft-outlook' });
    await expect(
      svc.updateUserApplication('u@x', { applicationId: 'a', providerId: 'google-gmail', connectionMethod: 'oauth2', displayName: 'd' } as never, new Request('https://x')),
    ).rejects.toThrow(BadRequestError);
  });

  it('updateUserApplication preserves IMAP password when not supplied', async () => {
    mockGetByIdForUser.mockResolvedValue({
      ...oauthApp,
      connectionMethod: 'imap-password',
      credentials: { imapPassword: 'old' },
    });
    mockUpdateForUser.mockResolvedValue({ applicationId: 'app-1' });
    const svc = new ApplicationService(makeEnv());
    await svc.updateUserApplication('u@x', { applicationId: 'a', providerId: 'google-gmail', connectionMethod: 'imap-password', displayName: 'd' } as never, new Request('https://x'));
    expect(mockUpdateForUser.mock.calls[0][3]).toEqual({ imapPassword: 'old' });
  });

  it('updateUserApplication resets to draft when OAuth2 credentials change', async () => {
    mockGetByIdForUser.mockResolvedValue(oauthApp);
    mockUpdateForUser.mockResolvedValue({ applicationId: 'app-1' });
    const svc = new ApplicationService(makeEnv());
    await svc.updateUserApplication('u@x', { applicationId: 'a', providerId: 'google-gmail', connectionMethod: 'oauth2', displayName: 'd', clientId: 'new' } as never, new Request('https://x'));
    expect(mockUpdateForUser.mock.calls[0][4]).toBe('draft');
  });

  it('deleteUserApplication proceeds when stop-watch fails and cleans vector/token state', async () => {
    mockStopWatch.mockRejectedValue(new Error('gone'));
    mockListActiveVectorIds.mockResolvedValue(['v1']);
    const deleteByIds = vi.fn();
    const svc = new ApplicationService(
      makeEnv({ EMAIL_CONTEXT_INDEX: { deleteByIds }, OAUTH2_TOKEN_CACHE: {} }),
    );
    await svc.deleteUserApplication('u@x', 'app-1');
    expect(deleteByIds).toHaveBeenCalledWith(['v1']);
    expect(mockMarkDocumentsDeleted).toHaveBeenCalled();
    expect(mockDeleteAccessToken).toHaveBeenCalledWith('app-1');
    expect(mockDeleteForUser).toHaveBeenCalledWith('app-1', 'u@x');
  });

  it('integration CRUD enforces ownership with NotFound', async () => {
    const svc = new ApplicationService(makeEnv());
    await svc.listIntegrations('u@x', 'app-1');
    expect(mockListByApplicationId).toHaveBeenCalledWith('app-1');
    mockGetIntegrationByIdForUser.mockResolvedValue(undefined);
    await expect(svc.updateIntegration('u@x', { integrationId: 'i' } as never)).rejects.toThrow(NotFoundError);
    await expect(svc.deleteIntegration('u@x', 'i')).rejects.toThrow(NotFoundError);
    await expect(svc.testIntegration('u@x', 'i')).rejects.toThrow(NotFoundError);
    await expect(svc.listIntegrationDeliveries('u@x', 'i', 5)).rejects.toThrow(NotFoundError);
    mockGetIntegrationByIdForUser.mockResolvedValue({ integrationId: 'i' });
    await svc.testIntegration('u@x', 'i');
    expect(mockSendTestNotification).toHaveBeenCalled();
  });

  it('listLabels returns [] without cache, throws NotFound on missing app, [] on provider error', async () => {
    expect(await new ApplicationService(makeEnv()).listLabels('u@x', 'app-1')).toEqual([]);
    mockGetMetadataByIdForUser.mockResolvedValue(undefined);
    await expect(
      new ApplicationService(makeEnv({ OAUTH2_TOKEN_CACHE: {}, OAUTH2_TOKEN_REFRESHERS: {} })).listLabels('u@x', 'app-1'),
    ).rejects.toThrow(NotFoundError);
    mockGetMetadataByIdForUser.mockResolvedValue({ applicationId: 'app-1', providerId: 'google-gmail', connectionMethod: 'oauth2' });
    mockGetAccessToken.mockRejectedValue(new Error('token'));
    expect(
      await new ApplicationService(makeEnv({ OAUTH2_TOKEN_CACHE: {}, OAUTH2_TOKEN_REFRESHERS: {} })).listLabels('u@x', 'app-1'),
    ).toEqual([]);
  });

  it('getRules enforces ownership and updateRules throws NotFound when update misses', async () => {
    mockGetMetadataByIdForUser.mockResolvedValue(undefined);
    await expect(new ApplicationService(makeEnv()).getRules('u@x', 'app-1')).rejects.toThrow(NotFoundError);
    mockGetMetadataByIdForUser.mockResolvedValue({ applicationId: 'app-1', emailProcessingRules: [{ a: 1 }] });
    expect(await new ApplicationService(makeEnv()).getRules('u@x', 'app-1')).toEqual([{ a: 1 }]);
    mockUpdateEmailProcessingRulesForUser.mockResolvedValue(undefined);
    await expect(new ApplicationService(makeEnv()).updateRules('u@x', 'app-1', [])).rejects.toThrow(NotFoundError);
  });

  it('suggestRule requires AI and tolerates usage-record failures', async () => {
    await expect(new ApplicationService(makeEnv()).suggestRule('u@x', 'app-1', 'd')).rejects.toThrow(BadRequestError);
    mockSuggestWithUsage.mockResolvedValue({ rule: { condition: 'c' }, usage: undefined });
    mockIncrementUsage.mockRejectedValue(new Error('d1 down'));
    const rule = await new ApplicationService(makeEnv({ AI: {} })).suggestRule('u@x', 'app-1', 'vip mail');
    expect(rule).toEqual({ condition: 'c' });
  });

  it('acknowledgeApplicationError and watch-settings throw NotFound when missing', async () => {
    mockAcknowledgeErrorForUser.mockResolvedValue(undefined);
    mockUpdateWatchedFolderIdsForUser.mockResolvedValue(undefined);
    const svc = new ApplicationService(makeEnv());
    await expect(svc.acknowledgeApplicationError('u@x', 'a', 'processing', new Request('https://x'))).rejects.toThrow(NotFoundError);
    await expect(svc.updateWatchedFolderIds('u@x', { applicationId: 'a', folderIds: [] } as never, new Request('https://x'))).rejects.toThrow(NotFoundError);
  });
});
