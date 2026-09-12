import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockListExecutions,
  mockDeleteUserApplication,
  mockAcknowledgeError,
  mockUpdateContextSettings,
  mockDeleteDocuments,
  mockListDeletionRuns,
  mockListDocuments,
  mockGetDocumentProviderLink,
  mockListAuditLogs,
  mockGetRules,
  mockUpdateRules,
  mockSuggestRule,
  mockListFolders,
  mockListLabels,
  mockUpdateIntegration,
  mockDeleteIntegration,
  mockListIntegrationDeliveries,
  mockTestIntegration,
  mockUpdateWatchedFolderIds,
  mockListUserApplications,
  mockStartWatch,
  mockStopWatch,
  mockCreateAuthorization,
  mockListCalendarEvents,
  mockListProcessedMessages,
  mockChat,
  mockGetConfig,
  mockGetByIdForUser,
  mockGetOwnedApplication,
  mockGetAccessToken,
  mockSendDigestForced,
} = vi.hoisted(() => ({
  mockListExecutions: vi.fn(),
  mockDeleteUserApplication: vi.fn(),
  mockAcknowledgeError: vi.fn(),
  mockUpdateContextSettings: vi.fn(),
  mockDeleteDocuments: vi.fn(),
  mockListDeletionRuns: vi.fn(),
  mockListDocuments: vi.fn(),
  mockGetDocumentProviderLink: vi.fn(),
  mockListAuditLogs: vi.fn(),
  mockGetRules: vi.fn(),
  mockUpdateRules: vi.fn(),
  mockSuggestRule: vi.fn(),
  mockListFolders: vi.fn(),
  mockListLabels: vi.fn(),
  mockUpdateIntegration: vi.fn(),
  mockDeleteIntegration: vi.fn(),
  mockListIntegrationDeliveries: vi.fn(),
  mockTestIntegration: vi.fn(),
  mockUpdateWatchedFolderIds: vi.fn(),
  mockListUserApplications: vi.fn(),
  mockStartWatch: vi.fn(),
  mockStopWatch: vi.fn(),
  mockCreateAuthorization: vi.fn(),
  mockListCalendarEvents: vi.fn(),
  mockListProcessedMessages: vi.fn(),
  mockChat: vi.fn(),
  mockGetConfig: vi.fn(),
  mockGetByIdForUser: vi.fn(),
  mockGetOwnedApplication: vi.fn(),
  mockGetAccessToken: vi.fn(),
  mockSendDigestForced: vi.fn(),
}));

vi.mock('@mail-otter/backend-services/action', () => ({
  ActionService: { listExecutionsForUser: mockListExecutions },
}));

vi.mock('@mail-otter/backend-services/application', () => ({
  ApplicationService: vi.fn(function () {
    return {
      deleteUserApplication: mockDeleteUserApplication,
      acknowledgeApplicationError: mockAcknowledgeError,
      getRules: mockGetRules,
      updateRules: mockUpdateRules,
      suggestRule: mockSuggestRule,
      listLabels: mockListLabels,
      updateIntegration: mockUpdateIntegration,
      deleteIntegration: mockDeleteIntegration,
      listIntegrationDeliveries: mockListIntegrationDeliveries,
      testIntegration: mockTestIntegration,
      updateWatchedFolderIds: mockUpdateWatchedFolderIds,
      listUserApplications: mockListUserApplications,
      listFolders: mockListFolders,
      getOwnedApplication: mockGetOwnedApplication,
    };
  }),
  FolderService: vi.fn(function () {
    return { listFolders: mockListFolders };
  }),
}));

vi.mock('@mail-otter/backend-services/oauth2', () => ({
  OAuth2AccessTokenService: vi.fn(function () {
    return { getAccessToken: mockGetAccessToken };
  }),
  OAuth2AuthorizationService: vi.fn(function () {
    return { createAuthorization: mockCreateAuthorization };
  }),
}));

vi.mock('@mail-otter/backend-services/digest', () => ({
  DigestConfigService: vi.fn(function () {
    return { getConfig: mockGetConfig };
  }),
  DigestService: vi.fn(function () {
    return { sendDigestForced: mockSendDigestForced };
  }),
}));

vi.mock('@mail-otter/backend-services/email', () => ({
  ContextService: vi.fn(function () {
    return {
      updateContextSettings: mockUpdateContextSettings,
      deleteDocuments: mockDeleteDocuments,
      listDeletionRuns: mockListDeletionRuns,
      listDocuments: mockListDocuments,
      getDocumentProviderLink: mockGetDocumentProviderLink,
      listAuditLogs: mockListAuditLogs,
    };
  }),
}));

vi.mock('@mail-otter/backend-services/subscription', () => ({
  WatchService: vi.fn(function () {
    return { startApplicationWatch: mockStartWatch, stopApplicationWatch: mockStopWatch };
  }),
}));

vi.mock('@mail-otter/backend-services/chat', () => ({
  ChatService: { chat: mockChat },
}));

vi.mock('@mail-otter/backend-services/processing', () => ({
  ProcessingService: {
    listCalendarEvents: mockListCalendarEvents,
    listProcessedMessages: mockListProcessedMessages,
  },
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return { getByIdForUser: mockGetByIdForUser };
  }),
}));

import { ListEmailActionExecutionsRoute } from '../../apps/api/src/endpoints/user/actions/executions/GET';
import { DeleteApplicationRoute } from '../../apps/api/src/endpoints/user/application/DELETE';
import { UpdateApplicationContextRoute } from '../../apps/api/src/endpoints/user/application/context/PUT';
import { DeleteApplicationContextDocumentsRoute } from '../../apps/api/src/endpoints/user/application/context/delete-documents/POST';
import { ListApplicationContextDeletionRunsRoute } from '../../apps/api/src/endpoints/user/application/context/deletions/GET';
import { ListApplicationContextDocumentsRoute } from '../../apps/api/src/endpoints/user/application/context/documents/GET';
import { GetApplicationContextDocumentProviderLinkRoute } from '../../apps/api/src/endpoints/user/application/context/document/provider-link/GET';
import { ListContextDocumentAuditLogsRoute } from '../../apps/api/src/endpoints/user/application/context/document/audit-logs/GET';
import { DismissApplicationErrorRoute } from '../../apps/api/src/endpoints/user/application/dismiss-error/POST';
import { GetApplicationFoldersRoute } from '../../apps/api/src/endpoints/user/application/folders/GET';
import { GetApplicationLabelsRoute } from '../../apps/api/src/endpoints/user/application/labels/GET';
import { GetApplicationRulesRoute } from '../../apps/api/src/endpoints/user/application/rules/GET';
import { UpdateApplicationRulesRoute } from '../../apps/api/src/endpoints/user/application/rules/PUT';
import { SuggestApplicationRuleRoute } from '../../apps/api/src/endpoints/user/application/rules/suggest/POST';
import { StartApplicationWatchRoute } from '../../apps/api/src/endpoints/user/application/watch/POST';
import { StopApplicationWatchRoute } from '../../apps/api/src/endpoints/user/application/stop/POST';
import { UpdateApplicationWatchSettingsRoute } from '../../apps/api/src/endpoints/user/application/watch-settings/PUT';
import { CreateOAuth2AuthorizationRoute } from '../../apps/api/src/endpoints/user/application/oauth2/authorize/POST';
import { UpdateIntegrationRoute } from '../../apps/api/src/endpoints/user/application/integrations/PUT';
import { DeleteIntegrationRoute } from '../../apps/api/src/endpoints/user/application/integrations/DELETE';
import { ListIntegrationDeliveriesRoute } from '../../apps/api/src/endpoints/user/application/integrations/deliveries/GET';
import { TestIntegrationRoute } from '../../apps/api/src/endpoints/user/application/integrations/test/POST';
import { ListApplicationsRoute } from '../../apps/api/src/endpoints/user/applications/GET';
import { ChatRoute } from '../../apps/api/src/endpoints/user/chat/POST';
import { ListProcessingCalendarEventsRoute } from '../../apps/api/src/endpoints/user/processing/calendar-events/GET';
import { ListProcessedMessagesRoute } from '../../apps/api/src/endpoints/user/processing/messages/GET';
import { SendDigestNowRoute } from '../../apps/api/src/endpoints/user/application/digest/send/POST';
import { BadRequestError, NotFoundError } from '@mail-otter/backend-errors';

function makeCxt(params: Record<string, string | undefined> = {}) {
  return {
    get: vi.fn().mockReturnValue('user@example.com'),
    req: { param: vi.fn((name: string) => params[name]) },
  } as never;
}

function makeEnv(extra: Record<string, unknown> = {}) {
  return {
    DB: {},
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master') },
    ACTION_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('action-key') },
    ACTION_SIGNING_SECRET: { get: vi.fn().mockResolvedValue('sign-key') },
    OAUTH2_TOKEN_CACHE: {},
    OAUTH2_TOKEN_REFRESHERS: {},
    ...extra,
  } as never;
}

function call(route: unknown, request: unknown, env: never, cxt: never) {
  return (route as { handleRequest(request: unknown, env: never, cxt: never): Promise<unknown> }).handleRequest(
    request,
    env,
    cxt,
  );
}

function req(url: string, extra: Record<string, unknown> = {}) {
  return { raw: new Request(url), ...extra };
}

describe('remaining user routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET executions requires actionId, then delegates', async () => {
    await expect(call(new ListEmailActionExecutionsRoute(), req('https://x/e'), makeEnv(), makeCxt())).rejects.toThrow(
      BadRequestError,
    );
    mockListExecutions.mockResolvedValue({ executions: [] });
    await call(new ListEmailActionExecutionsRoute(), req('https://x/e'), makeEnv(), makeCxt({ actionId: 'a-1' }));
    expect(mockListExecutions).toHaveBeenCalledWith('a-1', 'user@example.com', expect.anything());
  });

  it('DELETE application delegates and returns success', async () => {
    const result = (await call(
      new DeleteApplicationRoute(),
      req('https://x/', { applicationId: 'app-1' }),
      makeEnv(),
      makeCxt(),
    )) as { success: boolean };
    expect(mockDeleteUserApplication).toHaveBeenCalledWith('user@example.com', 'app-1');
    expect(result.success).toBe(true);
  });

  it('PUT context validates maxContextDocuments bounds', async () => {
    await expect(
      call(new UpdateApplicationContextRoute(), req('https://x/', { maxContextDocuments: 0 }), makeEnv(), makeCxt()),
    ).rejects.toThrow(BadRequestError);
    mockUpdateContextSettings.mockResolvedValue({ applicationId: 'app-1' });
    await call(
      new UpdateApplicationContextRoute(),
      req('https://x/', { applicationId: 'app-1' }),
      makeEnv(),
      makeCxt(),
    );
    expect(mockUpdateContextSettings).toHaveBeenCalled();
  });

  it('POST delete-documents delegates', async () => {
    mockDeleteDocuments.mockResolvedValue({ runId: 'r-1' });
    await call(
      new DeleteApplicationContextDocumentsRoute(),
      req('https://x/', { applicationId: 'app-1' }),
      makeEnv(),
      makeCxt(),
    );
    expect(mockDeleteDocuments).toHaveBeenCalledWith('user@example.com', 'app-1');
  });

  it('GET deletions/documents forward query params', async () => {
    mockListDeletionRuns.mockResolvedValue({ deletionRuns: [] });
    mockListDocuments.mockResolvedValue({ documents: [] });
    await call(
      new ListApplicationContextDeletionRunsRoute(),
      req('https://x/?applicationId=app-1&cursor=c'),
      makeEnv(),
      makeCxt(),
    );
    expect(mockListDeletionRuns).toHaveBeenCalledWith('user@example.com', { applicationId: 'app-1', cursor: 'c' });
    await call(
      new ListApplicationContextDocumentsRoute(),
      req('https://x/?applicationId=app-1&cursor=c'),
      makeEnv(),
      makeCxt(),
    );
    expect(mockListDocuments).toHaveBeenCalled();
  });

  it('document provider-link and audit-logs require contextDocumentId', async () => {
    await expect(
      call(new GetApplicationContextDocumentProviderLinkRoute(), req('https://x/'), makeEnv(), makeCxt()),
    ).rejects.toThrow(BadRequestError);
    await expect(
      call(new ListContextDocumentAuditLogsRoute(), req('https://x/'), makeEnv(), makeCxt()),
    ).rejects.toThrow(BadRequestError);
    mockGetDocumentProviderLink.mockResolvedValue('https://provider/doc');
    mockListAuditLogs.mockResolvedValue({ logs: [] });
    await call(new GetApplicationContextDocumentProviderLinkRoute(), req('https://x/'), makeEnv(), makeCxt({ contextDocumentId: 'd-1' }));
    expect(mockGetDocumentProviderLink).toHaveBeenCalledWith('user@example.com', 'd-1');
    await call(
      new ListContextDocumentAuditLogsRoute(),
      req('https://x/?cursor=c'),
      makeEnv(),
      makeCxt({ contextDocumentId: 'd-1' }),
    );
    expect(mockListAuditLogs).toHaveBeenCalledWith('user@example.com', 'd-1', 'c');
  });

  it('POST dismiss-error delegates', async () => {
    mockAcknowledgeError.mockResolvedValue({ applicationId: 'app-1' });
    await call(
      new DismissApplicationErrorRoute(),
      req('https://x/', { applicationId: 'app-1', errorType: 'processing' }),
      makeEnv(),
      makeCxt(),
    );
    expect(mockAcknowledgeError).toHaveBeenCalled();
  });

  it('GET folders/labels/rules forward applicationId', async () => {
    mockListFolders.mockResolvedValue([]);
    mockListLabels.mockResolvedValue([]);
    mockGetRules.mockResolvedValue([]);
    await call(new GetApplicationFoldersRoute(), req('https://x/?applicationId=app-1'), makeEnv(), makeCxt());
    expect(mockListFolders).toHaveBeenCalledWith('user@example.com', 'app-1');
    await call(new GetApplicationLabelsRoute(), req('https://x/?applicationId=app-1'), makeEnv(), makeCxt());
    expect(mockListLabels).toHaveBeenCalledWith('user@example.com', 'app-1');
    await call(new GetApplicationRulesRoute(), req('https://x/?applicationId=app-1'), makeEnv(), makeCxt());
    expect(mockGetRules).toHaveBeenCalledWith('user@example.com', 'app-1');
  });

  it('PUT rules and POST suggest delegate', async () => {
    mockUpdateRules.mockResolvedValue({ applicationId: 'app-1' });
    mockSuggestRule.mockResolvedValue({ condition: 'x' });
    await call(
      new UpdateApplicationRulesRoute(),
      req('https://x/', { applicationId: 'app-1', rules: [] }),
      makeEnv(),
      makeCxt(),
    );
    expect(mockUpdateRules).toHaveBeenCalledWith('user@example.com', 'app-1', []);
    await call(
      new SuggestApplicationRuleRoute(),
      req('https://x/', { applicationId: 'app-1', description: 'vip' }),
      makeEnv(),
      makeCxt(),
    );
    expect(mockSuggestRule).toHaveBeenCalledWith('user@example.com', 'app-1', 'vip');
  });

  it('watch start/stop and watch-settings delegate', async () => {
    mockStartWatch.mockResolvedValue({ ok: true });
    await call(
      new StartApplicationWatchRoute(),
      req('https://x/', { applicationId: 'app-1' }),
      makeEnv(),
      makeCxt(),
    );
    expect(mockStartWatch).toHaveBeenCalled();
    const stopped = (await call(
      new StopApplicationWatchRoute(),
      req('https://x/', { applicationId: 'app-1' }),
      makeEnv(),
      makeCxt(),
    )) as { message: string };
    expect(mockStopWatch).toHaveBeenCalledWith('user@example.com', 'app-1');
    expect(stopped.message).toContain('stopped');
    mockUpdateWatchedFolderIds.mockResolvedValue({ applicationId: 'app-1' });
    await call(
      new UpdateApplicationWatchSettingsRoute(),
      req('https://x/', { applicationId: 'app-1' }),
      makeEnv(),
      makeCxt(),
    );
    expect(mockUpdateWatchedFolderIds).toHaveBeenCalled();
  });

  it('POST oauth2/authorize delegates', async () => {
    mockCreateAuthorization.mockResolvedValue({ url: 'https://auth' });
    await call(
      new CreateOAuth2AuthorizationRoute(),
      req('https://x/', { applicationId: 'app-1' }),
      makeEnv(),
      makeCxt(),
    );
    expect(mockCreateAuthorization).toHaveBeenCalled();
  });

  it('integrations PUT/DELETE/deliveries/test delegate; deliveries validates input', async () => {
    mockUpdateIntegration.mockResolvedValue({ integrationId: 'i-1' });
    mockListIntegrationDeliveries.mockResolvedValue([]);
    await expect(
      call(new ListIntegrationDeliveriesRoute(), req('https://x/'), makeEnv(), makeCxt()),
    ).rejects.toThrow(BadRequestError);
    await call(
      new UpdateIntegrationRoute(),
      req('https://x/', { integrationId: 'i-1', name: 'n', enabled: true, webhookUrl: 'https://h' }),
      makeEnv(),
      makeCxt(),
    );
    expect(mockUpdateIntegration).toHaveBeenCalled();
    const deleted = (await call(
      new DeleteIntegrationRoute(),
      req('https://x/', { integrationId: 'i-1' }),
      makeEnv(),
      makeCxt(),
    )) as { success: boolean };
    expect(mockDeleteIntegration).toHaveBeenCalledWith('user@example.com', 'i-1');
    expect(deleted.success).toBe(true);
    await call(new ListIntegrationDeliveriesRoute(), req('https://x/?integrationId=i-1&limit=5'), makeEnv(), makeCxt());
    expect(mockListIntegrationDeliveries).toHaveBeenCalledWith('user@example.com', 'i-1', 5);
    const tested = (await call(
      new TestIntegrationRoute(),
      req('https://x/', { integrationId: 'i-1' }),
      makeEnv(),
      makeCxt(),
    )) as { success: boolean };
    expect(mockTestIntegration).toHaveBeenCalledWith('user@example.com', 'i-1');
    expect(tested.success).toBe(true);
  });

  it('GET applications delegates', async () => {
    mockListUserApplications.mockResolvedValue([]);
    await call(new ListApplicationsRoute(), req('https://x/'), makeEnv(), makeCxt());
    expect(mockListUserApplications).toHaveBeenCalled();
  });

  it('POST chat requires query, then delegates', async () => {
    await expect(call(new ChatRoute(), req('https://x/', {}), makeEnv(), makeCxt())).rejects.toThrow(BadRequestError);
    mockChat.mockResolvedValue({ reply: 'hi' });
    await call(new ChatRoute(), req('https://x/', { query: '  hello ', applicationId: 'app-1' }), makeEnv(), makeCxt());
    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ userEmail: 'user@example.com', query: 'hello', applicationId: 'app-1' }),
    );
  });

  it('clamps deliveries limit and rejects over-large context caps', async () => {
    mockListIntegrationDeliveries.mockResolvedValue([]);
    await call(new ListIntegrationDeliveriesRoute(), req('https://x/?integrationId=i-1&limit=999'), makeEnv(), makeCxt());
    expect(mockListIntegrationDeliveries).toHaveBeenCalledWith('user@example.com', 'i-1', 50);
    await call(new ListIntegrationDeliveriesRoute(), req('https://x/?integrationId=i-1&limit=bogus'), makeEnv(), makeCxt());
    expect(mockListIntegrationDeliveries).toHaveBeenCalledWith('user@example.com', 'i-1', 20);
    await expect(
      call(
        new UpdateApplicationContextRoute(),
        req('https://x/', { maxContextDocuments: 99_999_999 }),
        makeEnv(),
        makeCxt(),
      ),
    ).rejects.toThrow(BadRequestError);
  });

  it('POST digest/send resolves ownership, token, and forced send', async () => {
    mockGetOwnedApplication.mockResolvedValue({ applicationId: 'app-1' });
    mockGetAccessToken.mockResolvedValue('tok');
    const result = (await call(
      new SendDigestNowRoute(),
      req('https://x/', { applicationId: 'app-1' }),
      makeEnv(),
      makeCxt(),
    )) as { sent: boolean };
    expect(mockGetOwnedApplication).toHaveBeenCalledWith('user@example.com', 'app-1');
    expect(mockGetAccessToken).toHaveBeenCalledWith('app-1');
    expect(mockSendDigestForced).toHaveBeenCalledWith({ applicationId: 'app-1' }, 'tok');
    expect(result.sent).toBe(true);
    mockGetOwnedApplication.mockRejectedValue(new NotFoundError('Connected application not found.'));
    await expect(
      call(new SendDigestNowRoute(), req('https://x/', { applicationId: 'missing' }), makeEnv(), makeCxt()),
    ).rejects.toThrow(NotFoundError);
  });

  it('processing calendar-events/messages forward filters', async () => {
    mockListCalendarEvents.mockResolvedValue({ events: [] });
    mockListProcessedMessages.mockResolvedValue({ messages: [] });
    await call(new ListProcessingCalendarEventsRoute(), req('https://x/?applicationId=app-1&cursor=c'), makeEnv(), makeCxt());
    expect(mockListCalendarEvents).toHaveBeenCalledWith(
      'user@example.com',
      { applicationId: 'app-1', cursor: 'c' },
      expect.anything(),
    );
    await call(
      new ListProcessedMessagesRoute(),
      req('https://x/?applicationId=app-1&status=processed&cursor=c'),
      makeEnv(),
      makeCxt(),
    );
    expect(mockListProcessedMessages).toHaveBeenCalledWith(
      'user@example.com',
      { applicationId: 'app-1', status: 'processed', cursor: 'c' },
      expect.anything(),
    );
  });
});
