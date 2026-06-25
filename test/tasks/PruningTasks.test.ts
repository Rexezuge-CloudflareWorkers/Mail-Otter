import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockDeleteOlderThan: vi.fn(),
  mockDeleteOlderThanDate: vi.fn(),
  mockDeleteExpiredSessions: vi.fn(),
  mockDeleteStaleDeletedDocuments: vi.fn(),
  mockDeleteStaleErrorDocuments: vi.fn(),
  mockDeleteOldDeletionRuns: vi.fn(),
  mockDeleteOldAuditLogs: vi.fn(),
  mockDeleteOldDeliveryLogs: vi.fn(),
  mockListDueApplicationIds: vi.fn(),
  mockListApplicationsOverDocumentLimit: vi.fn(),
  mockRefreshAccessToken: vi.fn(),
  mockPruneApplicationDocuments: vi.fn(),
  mockExpirePendingActions: vi.fn(),
  mockDeleteOldActions: vi.fn(),
  mockRecordRefreshSuccess: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  BackgroundTaskRunDAO: class {
    startRun = vi.fn().mockResolvedValue('run-id');
    succeedRun = vi.fn().mockResolvedValue(undefined);
    failRun = vi.fn().mockResolvedValue(undefined);
  },
  ProcessedMessageDAO: class {
    deleteOlderThan = mocks.mockDeleteOlderThan;
  },
  AiDailyUsageDAO: class {
    deleteOlderThanDate = mocks.mockDeleteOlderThanDate;
  },
  OAuth2AuthorizationSessionDAO: class {
    deleteExpiredSessions = mocks.mockDeleteExpiredSessions;
  },
  ApplicationContextDAO: class {
    deleteStaleDeletedDocuments = mocks.mockDeleteStaleDeletedDocuments;
    deleteStaleErrorDocuments = mocks.mockDeleteStaleErrorDocuments;
    deleteOldDeletionRuns = mocks.mockDeleteOldDeletionRuns;
    deleteOldAuditLogs = mocks.mockDeleteOldAuditLogs;
    listApplicationsOverDocumentLimit = mocks.mockListApplicationsOverDocumentLimit;
  },
  IntegrationDeliveryLogDAO: class {
    deleteOlderThan = mocks.mockDeleteOldDeliveryLogs;
  },
  OAuth2AccessTokenRefreshStatusDAO: class {
    listDueApplicationIds = mocks.mockListDueApplicationIds;
    recordRefreshSuccess = mocks.mockRecordRefreshSuccess;
  },
}));

vi.mock('@mail-otter/backend-services/email', () => ({
  ContextService: vi.fn(function () {
    return { pruneApplicationDocuments: mocks.mockPruneApplicationDocuments };
  }),
}));

vi.mock('@mail-otter/backend-services/oauth2', () => ({
  OAuth2AccessTokenService: vi.fn(function () {
    return { refreshAccessToken: mocks.mockRefreshAccessToken };
  }),
}));

vi.mock('@mail-otter/backend-services/action', () => ({
  ActionService: {
    expirePendingActions: mocks.mockExpirePendingActions,
    deleteOldActions: mocks.mockDeleteOldActions,
  },
}));

import { ProcessedMessagePruningTask } from '@mail-otter/background/scheduled';
import { AiDailyUsagePruningTask } from '@mail-otter/background/scheduled';
import { OAuth2SessionPruningTask } from '@mail-otter/background/scheduled';
import { StaleContextDocumentPruningTask } from '@mail-otter/background/scheduled';
import { ContextDeletionRunPruningTask } from '@mail-otter/background/scheduled';
import { AuditLogPruningTask } from '@mail-otter/background/scheduled';
import { ContextDocumentPruningTask } from '@mail-otter/background/scheduled';
import { EmailActionPruningTask } from '@mail-otter/background/scheduled';
import { OAuth2AccessTokenRefreshTask } from '@mail-otter/background/scheduled';
import { IntegrationDeliveryLogPruningTask } from '@mail-otter/background/scheduled';

function createMockEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DB: {
      withSession: vi.fn().mockReturnValue({
        prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({ success: true }) }) }),
      }),
    },
    ...overrides,
  };
}

function createScheduledController(): ScheduledController {
  return {
    scheduledTime: 1_000_000,
    cron: '* * * * *',
    noRetry: vi.fn(),
  };
}

function createExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}

describe('ProcessedMessagePruningTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.mockDeleteOlderThan.mockResolvedValue(0);
  });

  it('deletes old processed messages', async () => {
    await new ProcessedMessagePruningTask().handle(createScheduledController(), createMockEnv() as Env, createExecutionContext());
    expect(mocks.mockDeleteOlderThan).toHaveBeenCalled();
    const olderThan: number = mocks.mockDeleteOlderThan.mock.calls[0][0] as number;
    expect(olderThan).toBeLessThan(Date.now() / 1000);
  });
});

describe('AiDailyUsagePruningTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.mockDeleteOlderThanDate.mockResolvedValue(0);
  });

  it('deletes old daily usage records', async () => {
    await new AiDailyUsagePruningTask().handle(createScheduledController(), createMockEnv() as Env, createExecutionContext());
    expect(mocks.mockDeleteOlderThanDate).toHaveBeenCalled();
  });
});

describe('OAuth2SessionPruningTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.mockDeleteExpiredSessions.mockResolvedValue(0);
  });

  it('deletes expired OAuth2 sessions', async () => {
    await new OAuth2SessionPruningTask().handle(createScheduledController(), createMockEnv() as Env, createExecutionContext());
    expect(mocks.mockDeleteExpiredSessions).toHaveBeenCalled();
  });
});

describe('StaleContextDocumentPruningTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.mockDeleteStaleDeletedDocuments.mockResolvedValue(0);
    mocks.mockDeleteStaleErrorDocuments.mockResolvedValue(0);
  });

  it('deletes stale context documents', async () => {
    await new StaleContextDocumentPruningTask().handle(createScheduledController(), createMockEnv() as Env, createExecutionContext());
    expect(mocks.mockDeleteStaleDeletedDocuments).toHaveBeenCalled();
    expect(mocks.mockDeleteStaleErrorDocuments).toHaveBeenCalled();
    const deletedBefore: number = mocks.mockDeleteStaleDeletedDocuments.mock.calls[0][0] as number;
    const errorBefore: number = mocks.mockDeleteStaleErrorDocuments.mock.calls[0][0] as number;
    expect(deletedBefore).toBeLessThan(Date.now() / 1000);
    expect(errorBefore).toBeLessThan(Date.now() / 1000);
  });
});

describe('ContextDeletionRunPruningTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.mockDeleteOldDeletionRuns.mockResolvedValue(0);
  });

  it('deletes old context deletion runs', async () => {
    await new ContextDeletionRunPruningTask().handle(createScheduledController(), createMockEnv() as Env, createExecutionContext());
    expect(mocks.mockDeleteOldDeletionRuns).toHaveBeenCalled();
    const olderThan: number = mocks.mockDeleteOldDeletionRuns.mock.calls[0][0] as number;
    expect(olderThan).toBeLessThan(Date.now() / 1000);
  });
});

describe('AuditLogPruningTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.mockDeleteOldAuditLogs.mockResolvedValue(0);
  });

  it('deletes old audit log entries', async () => {
    await new AuditLogPruningTask().handle(createScheduledController(), createMockEnv() as Env, createExecutionContext());
    expect(mocks.mockDeleteOldAuditLogs).toHaveBeenCalled();
  });
});

describe('IntegrationDeliveryLogPruningTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.mockDeleteOldDeliveryLogs.mockResolvedValue(0);
  });

  it('deletes old delivery log entries', async () => {
    await new IntegrationDeliveryLogPruningTask().handle(createScheduledController(), createMockEnv() as Env, createExecutionContext());
    expect(mocks.mockDeleteOldDeliveryLogs).toHaveBeenCalled();
    const olderThan: number = mocks.mockDeleteOldDeliveryLogs.mock.calls[0][0] as number;
    expect(olderThan).toBeLessThan(Date.now() / 1000);
  });
});

describe('ContextDocumentPruningTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.mockListApplicationsOverDocumentLimit.mockResolvedValue([]);
  });

  it('prunes documents for applications over limit', async () => {
    await new ContextDocumentPruningTask().handle(createScheduledController(), createMockEnv() as Env, createExecutionContext());
    expect(mocks.mockListApplicationsOverDocumentLimit).toHaveBeenCalled();
  });

  it('calls pruneApplicationDocuments for over-limit apps', async () => {
    mocks.mockListApplicationsOverDocumentLimit.mockResolvedValue([
      { applicationId: 'app-1', userEmail: 'user@test.com', activeCount: 150, effectiveLimit: 100 },
    ]);
    mocks.mockPruneApplicationDocuments.mockResolvedValue(undefined);
    await new ContextDocumentPruningTask().handle(createScheduledController(), createMockEnv() as Env, createExecutionContext());
    expect(mocks.mockPruneApplicationDocuments).toHaveBeenCalledWith('app-1', 'user@test.com', 150, 100);
  });
});

describe('EmailActionPruningTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.mockExpirePendingActions.mockResolvedValue(0);
    mocks.mockDeleteOldActions.mockResolvedValue(0);
  });

  it('expires pending and deletes old actions', async () => {
    await new EmailActionPruningTask().handle(createScheduledController(), createMockEnv() as Env, createExecutionContext());
    expect(mocks.mockExpirePendingActions).toHaveBeenCalled();
    expect(mocks.mockDeleteOldActions).toHaveBeenCalled();
  });
});

describe('OAuth2AccessTokenRefreshTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.mockListDueApplicationIds.mockReset().mockResolvedValue([]);
    mocks.mockRefreshAccessToken.mockReset().mockResolvedValue(undefined);
  });

  it('reads due application IDs and refreshes tokens', async () => {
    mocks.mockListDueApplicationIds.mockResolvedValue(['app-1', 'app-2']);
    mocks.mockRefreshAccessToken.mockResolvedValue(undefined);
    await new OAuth2AccessTokenRefreshTask().handle(createScheduledController(), createMockEnv({
      AES_ENCRYPTION_KEY_SECRET: { secret: 'test-key' },
      OAUTH2_TOKEN_CACHE: {},
      OAUTH2_TOKEN_REFRESHERS: {},
    }) as Env, createExecutionContext());
    expect(mocks.mockListDueApplicationIds).toHaveBeenCalled();
    expect(mocks.mockRefreshAccessToken).toHaveBeenCalledTimes(2);
    expect(mocks.mockRefreshAccessToken).toHaveBeenCalledWith('app-1', { forceRefresh: true });
  });

  it('continues when token refresh fails for one application', async () => {
    mocks.mockListDueApplicationIds.mockResolvedValue(['app-1', 'app-2']);
    mocks.mockRefreshAccessToken.mockRejectedValueOnce(new Error('Refresh failed'));
    mocks.mockRefreshAccessToken.mockResolvedValueOnce(undefined);
    await new OAuth2AccessTokenRefreshTask().handle(createScheduledController(), createMockEnv({
      AES_ENCRYPTION_KEY_SECRET: { secret: 'test-key' },
      OAUTH2_TOKEN_CACHE: {},
      OAUTH2_TOKEN_REFRESHERS: {},
    }) as Env, createExecutionContext());
    expect(mocks.mockRefreshAccessToken).toHaveBeenCalledTimes(2);
  });
});
