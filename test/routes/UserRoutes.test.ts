import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetCurrentUserSummary,
  mockUpdatePreferredLanguage,
  mockListActionsForUser,
  mockExecuteActionForUser,
  mockSnoozeAction,
  mockScheduleAction,
  mockCreateUserApplication,
  mockUpdateUserApplication,
  mockListIntegrations,
  mockCreateIntegration,
  mockGetAnalytics,
  mockListActivity,
  mockGetConfig,
  mockSaveConfig,
  mockListTaskRuns,
  mockTriggerTask,
  mockGetByIdForUser,
  mockGetUserByEmail,
  mockGetOwnedApplication,
  mockGetPreferredLanguage,
} = vi.hoisted(() => ({
  mockGetCurrentUserSummary: vi.fn(),
  mockUpdatePreferredLanguage: vi.fn(),
  mockListActionsForUser: vi.fn(),
  mockExecuteActionForUser: vi.fn(),
  mockSnoozeAction: vi.fn(),
  mockScheduleAction: vi.fn(),
  mockCreateUserApplication: vi.fn(),
  mockUpdateUserApplication: vi.fn(),
  mockListIntegrations: vi.fn(),
  mockCreateIntegration: vi.fn(),
  mockGetAnalytics: vi.fn(),
  mockListActivity: vi.fn(),
  mockGetConfig: vi.fn(),
  mockSaveConfig: vi.fn(),
  mockListTaskRuns: vi.fn(),
  mockTriggerTask: vi.fn().mockResolvedValue(undefined),
  mockGetByIdForUser: vi.fn(),
  mockGetUserByEmail: vi.fn().mockResolvedValue({ preferredLanguage: 'en' }),
  mockGetOwnedApplication: vi.fn(),
  mockGetPreferredLanguage: vi.fn().mockResolvedValue('en'),
}));

vi.mock('@mail-otter/backend-services/user', () => ({
  UserService: vi.fn(function () {
    return {
      getCurrentUserSummary: mockGetCurrentUserSummary,
      updatePreferredLanguage: mockUpdatePreferredLanguage,
      getPreferredLanguage: mockGetPreferredLanguage,
    };
  }),
}));

vi.mock('@mail-otter/backend-services/action', () => ({
  ActionService: Object.assign(
    vi.fn(function () {
      return { listActionsForUser: mockListActionsForUser };
    }),
    {
      listActionsForUser: mockListActionsForUser,
      executeActionForUser: mockExecuteActionForUser,
      snoozeAction: mockSnoozeAction,
      scheduleAction: mockScheduleAction,
    },
  ),
}));

vi.mock('@mail-otter/backend-services/application', () => ({
  ApplicationService: vi.fn(function () {
    return {
      createUserApplication: mockCreateUserApplication,
      updateUserApplication: mockUpdateUserApplication,
      listIntegrations: mockListIntegrations,
      createIntegration: mockCreateIntegration,
      getOwnedApplication: mockGetOwnedApplication,
    };
  }),
}));

vi.mock('@mail-otter/backend-services/analytics', () => ({
  AnalyticsService: vi.fn(function () {
    return { getAnalytics: mockGetAnalytics };
  }),
}));

vi.mock('@mail-otter/backend-services/activity', () => ({
  ActivityService: { listActivity: mockListActivity },
}));

vi.mock('@mail-otter/backend-services/digest', () => ({
  DigestConfigService: Object.assign(
    vi.fn(function () {
      return { getConfig: mockGetConfig, saveConfig: mockSaveConfig };
    }),
    { forDatabase: vi.fn(() => ({ getConfig: mockGetConfig, saveConfig: mockSaveConfig })) },
  ),
}));

vi.mock('@mail-otter/backend-services/processing', () => ({
  ProcessingService: Object.assign(
    vi.fn(function () {
      return { listTaskRuns: mockListTaskRuns, triggerTask: mockTriggerTask };
    }),
    { listTaskRuns: mockListTaskRuns, triggerTask: mockTriggerTask },
  ),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return { getByIdForUser: mockGetByIdForUser };
  }),
  UserDAO: vi.fn(function () {
    return { getByEmail: mockGetUserByEmail };
  }),
}));

import { GetCurrentUserRoute } from '../../apps/api/src/endpoints/user/me/GET';
import { UpdateCurrentUserRoute } from '../../apps/api/src/endpoints/user/me/PUT';
import { ListEmailActionsRoute } from '../../apps/api/src/endpoints/user/actions/GET';
import { ExecuteUserEmailActionRoute } from '../../apps/api/src/endpoints/user/actions/execute/POST';
import { SnoozeEmailActionRoute } from '../../apps/api/src/endpoints/user/actions/snooze/POST';
import { ScheduleEmailActionRoute } from '../../apps/api/src/endpoints/user/actions/schedule/POST';
import { CreateApplicationRoute } from '../../apps/api/src/endpoints/user/application/POST';
import { UpdateApplicationRoute } from '../../apps/api/src/endpoints/user/application/PUT';
import { GetDigestConfigRoute } from '../../apps/api/src/endpoints/user/application/digest/GET';
import { UpdateDigestConfigRoute } from '../../apps/api/src/endpoints/user/application/digest/PUT';
import { ListIntegrationsRoute } from '../../apps/api/src/endpoints/user/application/integrations/GET';
import { CreateIntegrationRoute } from '../../apps/api/src/endpoints/user/application/integrations/POST';
import { GetAnalyticsRoute } from '../../apps/api/src/endpoints/user/analytics/GET';
import { ListActivityRoute } from '../../apps/api/src/endpoints/user/activity/GET';
import { ListBackgroundTaskRunsRoute } from '../../apps/api/src/endpoints/user/processing/task-runs/GET';
import { RunTaskNowRoute } from '../../apps/api/src/endpoints/user/processing/run-task/POST';
import { BadRequestError } from '@mail-otter/backend-errors';

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

const SUMMARY = {
  preferredLanguage: 'en',
  limits: { maxApplicationsPerUser: 5, maxContextDocumentsPerApplication: 50 },
  aiUsage: { estimatedNeurons: 3, dailyNeuronLimit: 100, fallbackThreshold: 80 },
};

describe('user routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserSummary.mockResolvedValue(SUMMARY);
    mockUpdatePreferredLanguage.mockResolvedValue('de');
    mockGetUserByEmail.mockResolvedValue({ preferredLanguage: 'en' });
    mockGetByIdForUser.mockResolvedValue({ applicationId: 'app-1' });
    mockGetOwnedApplication.mockResolvedValue({ applicationId: 'app-1' });
    mockGetPreferredLanguage.mockResolvedValue('en');
    mockGetConfig.mockResolvedValue({ enabled: true, sendTime: '08:00', sections: ['summary'] });
    mockTriggerTask.mockResolvedValue(undefined);
  });

  it('GET /user/me returns the current user summary', async () => {
    const result = (await call(new GetCurrentUserRoute(), { raw: new Request('https://x/user/me') }, makeEnv(), makeCxt())) as {
      email: string;
    };
    expect(mockGetCurrentUserSummary).toHaveBeenCalledWith('user@example.com');
    expect(result.email).toBe('user@example.com');
  });

  it('PUT /user/me rejects missing preferredLanguage', async () => {
    await expect(
      call(new UpdateCurrentUserRoute(), { raw: new Request('https://x/user/me') }, makeEnv(), makeCxt()),
    ).rejects.toThrow(BadRequestError);
  });

  it('PUT /user/me rejects unsupported languages', async () => {
    await expect(
      call(
        new UpdateCurrentUserRoute(),
        { raw: new Request('https://x/user/me'), preferredLanguage: 'english' },
        makeEnv(),
        makeCxt(),
      ),
    ).rejects.toThrow(BadRequestError);
  });

  it('PUT /user/me updates and returns the summary', async () => {
    const result = (await call(
      new UpdateCurrentUserRoute(),
      { raw: new Request('https://x/user/me'), preferredLanguage: 'de' },
      makeEnv(),
      makeCxt(),
    )) as { preferredLanguage: string };
    expect(mockUpdatePreferredLanguage).toHaveBeenCalledWith('user@example.com', 'de');
    expect(result.preferredLanguage).toBe('de');
  });

  it('GET /user/actions forwards filters to ActionService', async () => {
    mockListActionsForUser.mockResolvedValue({ actions: [] });
    await call(
      new ListEmailActionsRoute(),
      { raw: new Request('https://x/user/actions?showSnoozed=true&status=pending&applicationId=app-1&cursor=c') },
      makeEnv(),
      makeCxt(),
    );
    expect(mockListActionsForUser).toHaveBeenCalledWith(
      'user@example.com',
      { applicationId: 'app-1', status: 'pending', cursor: 'c', showSnoozed: true },
      expect.anything(),
    );
  });

  it('POST /user/actions/:actionId/execute requires actionId', async () => {
    await expect(
      call(
        new ExecuteUserEmailActionRoute(),
        { raw: new Request('https://x/user/actions//execute') },
        makeEnv(),
        makeCxt({ actionId: undefined }),
      ),
    ).rejects.toThrow(BadRequestError);
  });

  it('POST /user/actions/:actionId/execute delegates to ActionService', async () => {
    mockExecuteActionForUser.mockResolvedValue({ actionId: 'a-1' });
    const result = (await call(
      new ExecuteUserEmailActionRoute(),
      { raw: new Request('https://x/user/actions/a-1/execute') },
      makeEnv(),
      makeCxt({ actionId: 'a-1' }),
    )) as { action: unknown };
    expect(mockExecuteActionForUser).toHaveBeenCalledWith('a-1', 'user@example.com', expect.any(Request), expect.anything());
    expect(result.action).toEqual({ actionId: 'a-1' });
  });

  it('POST /user/actions/:actionId/snooze parses snoozedUntil', async () => {
    mockSnoozeAction.mockResolvedValue({ actionId: 'a-1' });
    const raw = new Request('https://x/user/actions/a-1/snooze', {
      method: 'POST',
      body: JSON.stringify({ snoozedUntil: '2026-09-20T10:00:00Z' }),
    });
    await call(new SnoozeEmailActionRoute(), { raw }, makeEnv(), makeCxt({ actionId: 'a-1' }));
    expect(mockSnoozeAction).toHaveBeenCalledWith(
      expect.anything(),
      'a-1',
      'user@example.com',
      new Date('2026-09-20T10:00:00Z'),
    );
  });

  it('POST /user/actions/:actionId/snooze requires actionId', async () => {
    const raw = new Request('https://x/user/actions/snooze', {
      method: 'POST',
      body: JSON.stringify({ snoozedUntil: null }),
    });
    await expect(call(new SnoozeEmailActionRoute(), { raw }, makeEnv(), makeCxt({ actionId: undefined }))).rejects.toThrow(
      BadRequestError,
    );
  });

  it('POST /user/actions/:actionId/schedule parses scheduledFor', async () => {
    mockScheduleAction.mockResolvedValue({ actionId: 'a-2' });
    const raw = new Request('https://x/user/actions/a-2/schedule', {
      method: 'POST',
      body: JSON.stringify({ scheduledFor: null }),
    });
    const result = (await call(new ScheduleEmailActionRoute(), { raw }, makeEnv(), makeCxt({ actionId: 'a-2' }))) as {
      action: unknown;
    };
    expect(mockScheduleAction).toHaveBeenCalledWith(expect.anything(), 'a-2', 'user@example.com', null);
    expect(result.action).toEqual({ actionId: 'a-2' });
  });

  it('POST /user/application creates a mailbox', async () => {
    mockCreateUserApplication.mockResolvedValue({ applicationId: 'app-9' });
    const result = (await call(
      new CreateApplicationRoute(),
      { raw: new Request('https://x/user/application'), displayName: 'Work', providerId: 'google-gmail', connectionMethod: 'oauth2' },
      makeEnv(),
      makeCxt(),
    )) as { application: unknown };
    expect(mockCreateUserApplication).toHaveBeenCalled();
    expect(result.application).toEqual({ applicationId: 'app-9' });
  });

  it('PUT /user/application updates a mailbox', async () => {
    mockUpdateUserApplication.mockResolvedValue({ applicationId: 'app-1' });
    const result = (await call(
      new UpdateApplicationRoute(),
      { raw: new Request('https://x/user/application'), applicationId: 'app-1', displayName: 'Work' },
      makeEnv(),
      makeCxt(),
    )) as { application: unknown };
    expect(mockUpdateUserApplication).toHaveBeenCalled();
    expect(result.application).toEqual({ applicationId: 'app-1' });
  });

  it('GET /user/application/digest returns config', async () => {
    mockGetOwnedApplication.mockResolvedValue({ applicationId: 'app-1' });
    const result = (await call(
      new GetDigestConfigRoute(),
      { raw: new Request('https://x/user/application/digest'), applicationId: 'app-1' },
      makeEnv(),
      makeCxt(),
    )) as { digestConfig: unknown };
    expect(mockGetOwnedApplication).toHaveBeenCalledWith('user@example.com', 'app-1');
    expect(result.digestConfig).toEqual({ enabled: true, sendTime: '08:00', sections: ['summary'] });
  });

  it('PUT /user/application/digest rejects unknown applications', async () => {
    const { NotFoundError } = await import('@mail-otter/backend-errors');
    mockGetOwnedApplication.mockRejectedValue(new NotFoundError('Connected application not found.'));
    await expect(
      call(
        new UpdateDigestConfigRoute(),
        { raw: new Request('https://x/user/application/digest'), applicationId: 'missing', enabled: true, sendTime: '08:00', sections: [] },
        makeEnv(),
        makeCxt(),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it('PUT /user/application/digest saves and returns config', async () => {
    await call(
      new UpdateDigestConfigRoute(),
      { raw: new Request('https://x/user/application/digest'), applicationId: 'app-1', enabled: false, sendTime: '09:00', sections: [] },
      makeEnv(),
      makeCxt(),
    );
    expect(mockSaveConfig).toHaveBeenCalledWith('app-1', { enabled: false, sendTime: '09:00', sections: [] });
  });

  it('GET /user/application/integrations lists integrations', async () => {
    mockListIntegrations.mockResolvedValue([{ id: 'i-1' }]);
    const result = (await call(
      new ListIntegrationsRoute(),
      { raw: new Request('https://x/user/application/integrations?applicationId=app-1') },
      makeEnv(),
      makeCxt(),
    )) as { integrations: unknown[] };
    expect(mockListIntegrations).toHaveBeenCalledWith('user@example.com', 'app-1');
    expect(result.integrations).toHaveLength(1);
  });

  it('POST /user/application/integration creates an integration', async () => {
    mockCreateIntegration.mockResolvedValue({ id: 'i-2' });
    const result = (await call(
      new CreateIntegrationRoute(),
      { raw: new Request('https://x/user/application/integration'), applicationId: 'app-1', integrationType: 'webhook', name: 'Hook', webhookUrl: 'https://hook.example' },
      makeEnv(),
      makeCxt(),
    )) as { integration: unknown };
    expect(mockCreateIntegration).toHaveBeenCalledWith('user@example.com', {
      applicationId: 'app-1',
      integrationType: 'webhook',
      name: 'Hook',
      webhookUrl: 'https://hook.example',
    });
    expect(result.integration).toEqual({ id: 'i-2' });
  });

  it('GET /user/analytics clamps the days window', async () => {
    mockGetAnalytics.mockResolvedValue({ aiUsage: {} });
    await call(
      new GetAnalyticsRoute(),
      { raw: new Request('https://x/user/analytics?days=999&applicationId=app-1') },
      makeEnv(),
      makeCxt(),
    );
    expect(mockGetAnalytics).toHaveBeenCalledWith('user@example.com', { days: 365, applicationId: 'app-1' });

    await call(new GetAnalyticsRoute(), { raw: new Request('https://x/user/analytics') }, makeEnv(), makeCxt());
    expect(mockGetAnalytics).toHaveBeenCalledWith('user@example.com', { days: 30, applicationId: undefined });
  });

  it('GET /user/activity returns JSON entries by default', async () => {
    mockListActivity.mockResolvedValue({ entries: [{ id: 1 }] });
    const result = (await call(
      new ListActivityRoute(),
      { raw: new Request('https://x/user/activity?limit=10&types=email_processed') },
      makeEnv(),
      makeCxt(),
    )) as { entries: unknown[] };
    expect(mockListActivity).toHaveBeenCalledWith(
      'user@example.com',
      expect.objectContaining({ limit: 10, types: ['email_processed'] }),
      expect.anything(),
    );
    expect(result.entries).toHaveLength(1);
  });

  it('GET /user/activity exports CSV when requested', async () => {
    mockListActivity.mockResolvedValue({
      entries: [
        { eventType: 'email_processed', applicationId: 'app-1', timestamp: 1_700_000_000, providerMessageId: 'm-1', status: 'processed' },
        { eventType: 'action_created', applicationId: 'app-1', timestamp: 1_700_000_001, actionId: 'a-1', actionType: 'calendar.add_event', riskLevel: 'low' },
        { eventType: 'action_executed', applicationId: 'app-1', timestamp: 1_700_000_002, executionStatus: 'ok', actionId: 'a-1', actionType: 'calendar.add_event', triggeredBy: 'user' },
      ],
    });
    const result = (await call(
      new ListActivityRoute(),
      { raw: new Request('https://x/user/activity?format=csv') },
      makeEnv(),
      makeCxt(),
    )) as { rawBody: string; headers: Record<string, string> };
    expect(mockListActivity).toHaveBeenCalledWith(
      'user@example.com',
      expect.objectContaining({ limit: 1000 }),
      expect.anything(),
    );
    expect(result.headers['Content-Type']).toContain('text/csv');
    expect(result.rawBody).toContain('email_processed');
    expect(result.rawBody).toContain('action_created');
    expect(result.rawBody).toContain('action_executed');
  });

  it('GET /user/processing/task-runs forwards filters', async () => {
    mockListTaskRuns.mockResolvedValue({ runs: [] });
    await call(
      new ListBackgroundTaskRunsRoute(),
      { raw: new Request('https://x/user/processing/task-runs?taskType=calendar_sync&status=ok') },
      makeEnv(),
      makeCxt(),
    );
    expect(mockListTaskRuns).toHaveBeenCalledWith(
      'user@example.com',
      expect.objectContaining({ taskType: 'calendar_sync', status: 'ok' }),
    );
  });

  it('POST /user/processing/run-task triggers the task', async () => {
    const result = (await call(
      new RunTaskNowRoute(),
      { raw: new Request('https://x/user/processing/run-task'), taskType: 'calendar_sync', applicationId: 'app-1' },
      makeEnv(),
      makeCxt(),
    )) as { triggered: boolean };
    expect(mockTriggerTask).toHaveBeenCalledWith('user@example.com', 'calendar_sync', 'app-1', expect.anything());
    expect(result.triggered).toBe(true);
  });
});
