import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetById,
  mockListApplicationIdsWithProviderConfig,
  mockListActiveImapSubscriptions,
  mockUpdateImapCursor,
  mockStartRun,
  mockSucceedRun,
  mockFailRun,
  mockSkipRun,
  mockGetProvider,
  mockPollNewMessages,
  mockGetAccessToken,
  mockIsDueToSend,
  mockSendDigest,
  mockSyncForApplication,
  mockSyncPackageActions,
  mockSyncFlightActions,
  mockRenewDueSubscriptions,
  mockGetPackageTrackingApiKey,
  mockGetFlightTrackingApiKey,
} = vi.hoisted(() => ({
  mockGetById: vi.fn(),
  mockListApplicationIdsWithProviderConfig: vi.fn().mockResolvedValue([]),
  mockListActiveImapSubscriptions: vi.fn().mockResolvedValue([]),
  mockUpdateImapCursor: vi.fn().mockResolvedValue(undefined),
  mockStartRun: vi.fn().mockResolvedValue('run-1'),
  mockSucceedRun: vi.fn().mockResolvedValue(undefined),
  mockFailRun: vi.fn().mockResolvedValue(undefined),
  mockSkipRun: vi.fn().mockResolvedValue(undefined),
  mockGetProvider: vi.fn(),
  mockPollNewMessages: vi.fn(),
  mockGetAccessToken: vi.fn().mockResolvedValue('token-123'),
  mockIsDueToSend: vi.fn().mockResolvedValue(true),
  mockSendDigest: vi.fn().mockResolvedValue(undefined),
  mockSyncForApplication: vi.fn().mockResolvedValue(undefined),
  mockSyncPackageActions: vi.fn().mockResolvedValue(undefined),
  mockSyncFlightActions: vi.fn().mockResolvedValue(undefined),
  mockRenewDueSubscriptions: vi.fn().mockResolvedValue(undefined),
  mockGetPackageTrackingApiKey: vi.fn().mockReturnValue('pkg-key'),
  mockGetFlightTrackingApiKey: vi.fn().mockReturnValue('flt-key'),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return { getById: mockGetById, listApplicationIdsWithProviderConfig: mockListApplicationIdsWithProviderConfig };
  }),
  ProviderSubscriptionDAO: vi.fn(function () {
    return {
      listActiveImapSubscriptions: mockListActiveImapSubscriptions,
      updateImapCursor: mockUpdateImapCursor,
    };
  }),
  BackgroundTaskRunDAO: vi.fn(function () {
    return {
      startRun: mockStartRun,
      succeedRun: mockSucceedRun,
      failRun: mockFailRun,
      skipRun: mockSkipRun,
    };
  }),
}));

vi.mock('@mail-otter/backend-data/utils', () => ({
  createD1SessionEnv: vi.fn((env: unknown) => env),
}));

vi.mock('@mail-otter/backend-services/provider', () => ({
  EmailProviderRegistry: { get: mockGetProvider },
}));

vi.mock('@mail-otter/backend-services/oauth2', () => ({
  OAuth2AccessTokenService: vi.fn(function () {
    return { getAccessToken: mockGetAccessToken };
  }),
}));

vi.mock('@mail-otter/backend-services/digest', () => ({
  DigestConfigService: vi.fn(function () {
    return { isDueToSend: mockIsDueToSend };
  }),
  DigestService: vi.fn(function () {
    return { sendDigest: mockSendDigest };
  }),
  CalendarEventSyncUtil: vi.fn(function () {
    return { syncForApplication: mockSyncForApplication };
  }),
  ActionStatusSyncUtil: vi.fn(function () {
    return { syncPackageActions: mockSyncPackageActions, syncFlightActions: mockSyncFlightActions };
  }),
}));

vi.mock('@mail-otter/backend-services/subscription', () => ({
  SubscriptionRenewalUtil: vi.fn(function () {
    return { renewDueSubscriptions: mockRenewDueSubscriptions };
  }),
}));

vi.mock('@mail-otter/backend-runtime/config', () => ({
  ConfigurationManager: {
    digest: {
      getPackageTrackingApiKey: mockGetPackageTrackingApiKey,
      getFlightTrackingApiKey: mockGetFlightTrackingApiKey,
    },
  },
}));

import { ImapPollingTask } from '@mail-otter/background/scheduled/ImapPollingTask';
import { SubscriptionRenewalTask } from '@mail-otter/background/scheduled/SubscriptionRenewalTask';
import { ScheduledDigestTask } from '@mail-otter/background/scheduled/ScheduledDigestTask';
import { CalendarEventSyncTask } from '@mail-otter/background/scheduled/CalendarEventSyncTask';
import { ActionStatusSyncTask } from '@mail-otter/background/scheduled/ActionStatusSyncTask';

function baseEnv(extra: Record<string, unknown> = {}) {
  return {
    DB: {},
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master') },
    ACTION_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('action-key') },
    OAUTH2_TOKEN_CACHE: {},
    OAUTH2_TOKEN_REFRESHERS: {},
    EMAIL_EVENTS_QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
    ...extra,
  } as never;
}

async function run(task: { handleScheduledTask?: unknown }, env: never) {
  const fn = (task as unknown as {
    handleScheduledTask(event: unknown, env: never, ctx: unknown): Promise<unknown>;
  }).handleScheduledTask.bind(task);
  return fn({}, env, {});
}

function connectedApp(overrides: Record<string, unknown> = {}) {
  return {
    applicationId: 'app-1',
    userEmail: 'user@example.com',
    providerId: 'google-gmail',
    connectionMethod: 'oauth2',
    providerEmail: 'user@gmail.com',
    status: 'connected',
    enabledFeatures: ['gmail-calendar'],
    ...overrides,
  };
}

describe('ImapPollingTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListActiveImapSubscriptions.mockResolvedValue([]);
    mockGetProvider.mockReturnValue({ pollNewMessages: mockPollNewMessages });
  });

  it('reports zero when no subscriptions exist', async () => {
    const summary = (await run(new ImapPollingTask(), baseEnv())) as { itemsProcessed: number; itemsFailed: number };
    expect(summary.itemsProcessed).toBe(0);
    expect(summary.itemsFailed).toBe(0);
  });

  it('polls via oauth2 credentials and enqueues new messages', async () => {
    mockListActiveImapSubscriptions.mockResolvedValue([
      { subscriptionId: 'sub-1', applicationId: 'app-1', imapCursor: '5' },
    ]);
    mockGetById.mockResolvedValue(connectedApp());
    mockPollNewMessages.mockResolvedValue({ messages: [{ uid: 6 }, { uid: 7 }], newCursor: '7' });
    const env = baseEnv();
    const summary = (await run(new ImapPollingTask(), env)) as { itemsProcessed: number };
    expect(mockGetAccessToken).toHaveBeenCalledWith('app-1');
    expect(mockPollNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'oauth2', accessToken: 'token-123' }),
      '5',
    );
    expect(env.EMAIL_EVENTS_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'imap-notification', applicationId: 'app-1', messageUids: [6, 7] }),
    );
    expect(mockUpdateImapCursor).toHaveBeenCalledWith('sub-1', '7', expect.any(Number));
    expect(summary.itemsProcessed).toBe(1);
    expect(mockSucceedRun).toHaveBeenCalled();
  });

  it('skips cursor update when no new messages arrive', async () => {
    mockListActiveImapSubscriptions.mockResolvedValue([
      { subscriptionId: 'sub-1', applicationId: 'app-1', imapCursor: null },
    ]);
    mockGetById.mockResolvedValue(connectedApp());
    mockPollNewMessages.mockResolvedValue({ messages: [], newCursor: null });
    const env = baseEnv();
    await run(new ImapPollingTask(), env);
    expect(env.EMAIL_EVENTS_QUEUE.send).not.toHaveBeenCalled();
    expect(mockUpdateImapCursor).not.toHaveBeenCalled();
  });

  it('uses imap-password credentials directly', async () => {
    mockListActiveImapSubscriptions.mockResolvedValue([{ subscriptionId: 'sub-1', applicationId: 'app-1' }]);
    mockGetById.mockResolvedValue(
      connectedApp({
        connectionMethod: 'imap-password',
        imapUsername: 'u',
        imapPassword: 'p',
        imapHost: 'imap.example.com',
        imapPort: 993,
      }),
    );
    mockPollNewMessages.mockResolvedValue({ messages: [], newCursor: null });
    await run(new ImapPollingTask(), baseEnv());
    expect(mockGetAccessToken).not.toHaveBeenCalled();
    expect(mockPollNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'imap-password', username: 'u' }),
      null,
    );
  });

  it('records failures for incomplete credentials and missing applications', async () => {
    mockListActiveImapSubscriptions.mockResolvedValue([
      { subscriptionId: 'bad', applicationId: 'app-bad' },
      { subscriptionId: 'gone', applicationId: 'app-gone' },
    ]);
    mockGetById.mockImplementation(async (id: string) => {
      if (id === 'app-gone') return undefined;
      return connectedApp({ applicationId: 'app-bad', connectionMethod: 'imap-password' });
    });
    const summary = (await run(new ImapPollingTask(), baseEnv())) as {
      itemsProcessed: number;
      itemsFailed: number;
    };
    expect(summary.itemsFailed).toBe(1);
    expect(summary.itemsProcessed).toBe(1);
    expect(mockFailRun).toHaveBeenCalled();
  });

  it('records provider poll failures', async () => {
    mockListActiveImapSubscriptions.mockResolvedValue([{ subscriptionId: 'sub-1', applicationId: 'app-1' }]);
    mockGetById.mockResolvedValue(connectedApp());
    mockPollNewMessages.mockRejectedValue(new Error('imap down'));
    const summary = (await run(new ImapPollingTask(), baseEnv())) as { itemsFailed: number };
    expect(summary.itemsFailed).toBe(1);
    expect(mockFailRun).toHaveBeenCalled();
  });
});

describe('SubscriptionRenewalTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs the renewal sweep', async () => {
    const summary = (await run(new SubscriptionRenewalTask(), baseEnv())) as { itemsProcessed: number };
    expect(mockRenewDueSubscriptions).toHaveBeenCalledOnce();
    expect(summary.itemsProcessed).toBe(1);
  });
});

describe('ScheduledDigestTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListApplicationIdsWithProviderConfig.mockResolvedValue([]);
    mockGetById.mockResolvedValue(connectedApp());
    mockIsDueToSend.mockResolvedValue(true);
    mockGetProvider.mockReturnValue({ sendDigestEmail: vi.fn() });
  });

  it('returns zeros when no applications have digest enabled', async () => {
    const summary = (await run(new ScheduledDigestTask(), baseEnv())) as { itemsProcessed: number };
    expect(summary.itemsProcessed).toBe(0);
    expect(mockSendDigest).not.toHaveBeenCalled();
  });

  it('sends due digests for connected gmail applications', async () => {
    mockListApplicationIdsWithProviderConfig.mockResolvedValue(['app-1']);
    const summary = (await run(new ScheduledDigestTask(), baseEnv())) as {
      itemsProcessed: number;
      itemsFailed: number;
    };
    expect(mockSendDigest).toHaveBeenCalled();
    expect(summary.itemsProcessed).toBe(1);
    expect(summary.itemsFailed).toBe(0);
    expect(mockSucceedRun).toHaveBeenCalled();
  });

  it('skips disconnected applications', async () => {
    mockListApplicationIdsWithProviderConfig.mockResolvedValue(['app-1']);
    mockGetById.mockResolvedValue(connectedApp({ status: 'error' }));
    await run(new ScheduledDigestTask(), baseEnv());
    expect(mockSendDigest).not.toHaveBeenCalled();
    expect(mockSkipRun).toHaveBeenCalled();
  });

  it('skips providers without digest support', async () => {
    mockListApplicationIdsWithProviderConfig.mockResolvedValue(['app-1']);
    mockGetProvider.mockReturnValue({});
    mockGetById.mockResolvedValue(connectedApp({ providerId: 'fastmail-jmap' }));
    await run(new ScheduledDigestTask(), baseEnv());
    expect(mockSendDigest).not.toHaveBeenCalled();
    expect(mockSkipRun).toHaveBeenCalled();
  });

  it('skips providers when the registry lookup throws', async () => {
    mockListApplicationIdsWithProviderConfig.mockResolvedValue(['app-1']);
    mockGetProvider.mockImplementation(() => {
      throw new Error('unknown provider');
    });
    await run(new ScheduledDigestTask(), baseEnv());
    expect(mockSendDigest).not.toHaveBeenCalled();
    expect(mockSkipRun).toHaveBeenCalled();
  });

  it('skips applications that are not due yet', async () => {
    mockListApplicationIdsWithProviderConfig.mockResolvedValue(['app-1']);
    mockIsDueToSend.mockResolvedValue(false);
    const summary = (await run(new ScheduledDigestTask(), baseEnv())) as { itemsProcessed: number };
    expect(mockSendDigest).not.toHaveBeenCalled();
    expect(summary.itemsProcessed).toBe(0);
  });

  it('records failures when sending throws', async () => {
    mockListApplicationIdsWithProviderConfig.mockResolvedValue(['app-1']);
    mockSendDigest.mockRejectedValue(new Error('send failed'));
    const summary = (await run(new ScheduledDigestTask(), baseEnv())) as { itemsFailed: number };
    expect(summary.itemsFailed).toBe(1);
    expect(mockFailRun).toHaveBeenCalled();
  });
});

describe('CalendarEventSyncTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListApplicationIdsWithProviderConfig.mockResolvedValue([]);
    mockGetById.mockResolvedValue(connectedApp());
    mockGetProvider.mockReturnValue({ pollNewMessages: mockPollNewMessages, listCalendarEvents: vi.fn() });
  });

  it('returns zeros when nothing is enabled', async () => {
    const summary = (await run(new CalendarEventSyncTask(), baseEnv())) as { itemsProcessed: number };
    expect(summary.itemsProcessed).toBe(0);
  });

  it('syncs connected applications with the calendar feature', async () => {
    mockListApplicationIdsWithProviderConfig.mockResolvedValue(['app-1']);
    const summary = (await run(new CalendarEventSyncTask(), baseEnv())) as { itemsProcessed: number };
    expect(mockGetAccessToken).toHaveBeenCalledWith('app-1');
    expect(mockSyncForApplication).toHaveBeenCalled();
    expect(summary.itemsProcessed).toBe(1);
  });

  it('skips applications without the calendar feature', async () => {
    mockListApplicationIdsWithProviderConfig.mockResolvedValue(['app-1']);
    mockGetById.mockResolvedValue(connectedApp({ enabledFeatures: ['gmail-labels'] }));
    await run(new CalendarEventSyncTask(), baseEnv());
    expect(mockSyncForApplication).not.toHaveBeenCalled();
    expect(mockSkipRun).toHaveBeenCalled();
  });

  it('skips disconnected and unsupported-provider applications', async () => {
    mockListApplicationIdsWithProviderConfig.mockResolvedValue(['a', 'b']);
    mockGetProvider.mockReturnValue({});
    mockGetById
      .mockResolvedValueOnce(connectedApp({ applicationId: 'a', status: 'error' }))
      .mockResolvedValueOnce(connectedApp({ applicationId: 'b', providerId: 'yahoo-mail' }));
    await run(new CalendarEventSyncTask(), baseEnv());
    expect(mockSyncForApplication).not.toHaveBeenCalled();
    expect(mockSkipRun).toHaveBeenCalledTimes(2);
  });

  it('records sync failures', async () => {
    mockListApplicationIdsWithProviderConfig.mockResolvedValue(['app-1']);
    mockSyncForApplication.mockRejectedValue(new Error('cal down'));
    const summary = (await run(new CalendarEventSyncTask(), baseEnv())) as { itemsFailed: number };
    expect(summary.itemsFailed).toBe(1);
    expect(mockFailRun).toHaveBeenCalled();
  });
});

describe('ActionStatusSyncTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPackageTrackingApiKey.mockReturnValue('pkg-key');
    mockGetFlightTrackingApiKey.mockReturnValue('flt-key');
    mockListApplicationIdsWithProviderConfig.mockResolvedValue([]);
  });

  it('returns zeros when no tracking keys are configured', async () => {
    mockGetPackageTrackingApiKey.mockReturnValue('');
    mockGetFlightTrackingApiKey.mockReturnValue('');
    const summary = (await run(new ActionStatusSyncTask(), baseEnv())) as { itemsProcessed: number };
    expect(summary.itemsProcessed).toBe(0);
    expect(mockListApplicationIdsWithProviderConfig).not.toHaveBeenCalled();
  });

  it('syncs package and flight actions per application', async () => {
    mockListApplicationIdsWithProviderConfig.mockResolvedValue(['app-1']);
    const summary = (await run(new ActionStatusSyncTask(), baseEnv())) as { itemsProcessed: number };
    expect(mockSyncPackageActions).toHaveBeenCalledWith('app-1', 'pkg-key');
    expect(mockSyncFlightActions).toHaveBeenCalledWith('app-1', 'flt-key');
    expect(summary.itemsProcessed).toBe(1);
  });

  it('records sync failures without stopping the summary', async () => {
    mockListApplicationIdsWithProviderConfig.mockResolvedValue(['app-1']);
    mockSyncPackageActions.mockRejectedValue(new Error('pkg down'));
    const summary = (await run(new ActionStatusSyncTask(), baseEnv())) as { itemsFailed: number };
    expect(summary.itemsFailed).toBe(1);
    expect(mockFailRun).toHaveBeenCalled();
  });
});
