import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetForUser,
  mockSnoozeAction,
  mockCancelSnooze,
  mockScheduleAction,
  mockCancelSchedule,
  mockListPendingScheduledActions,
  mockClaimForExecution,
  mockMarkSucceeded,
  mockMarkFailed,
  mockMarkExpired,
  mockRecordExecution,
  mockGetById,
} = vi.hoisted(() => ({
  mockGetForUser: vi.fn(),
  mockSnoozeAction: vi.fn(),
  mockCancelSnooze: vi.fn(),
  mockScheduleAction: vi.fn(),
  mockCancelSchedule: vi.fn(),
  mockListPendingScheduledActions: vi.fn(),
  mockClaimForExecution: vi.fn(),
  mockMarkSucceeded: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockMarkExpired: vi.fn(),
  mockRecordExecution: vi.fn(),
  mockGetById: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  scopeForAnchor: (anchorEmail: string) => ({ id: null, anchorEmail }),
  userScopeSql: (scope: { id: string | null; anchorEmail: string }) =>
    scope.id
      ? { clause: '(user_id = ? OR (user_id IS NULL AND user_email = ?))', bindings: [scope.id, scope.anchorEmail] }
      : { clause: 'user_email = ?', bindings: [scope.anchorEmail] },
  EmailActionDAO: vi.fn(function () {
    return {
      getForUser: mockGetForUser,
      snoozeAction: mockSnoozeAction,
      cancelSnooze: mockCancelSnooze,
      scheduleAction: mockScheduleAction,
      cancelSchedule: mockCancelSchedule,
      listPendingScheduledActions: mockListPendingScheduledActions,
      claimForExecution: mockClaimForExecution,
      markSucceeded: mockMarkSucceeded,
      markFailed: mockMarkFailed,
      markExpired: mockMarkExpired,
      recordExecution: mockRecordExecution,
    };
  }),
  ConnectedApplicationDAO: vi.fn(function () {
    return { getById: mockGetById };
  }),
}));

vi.mock('@mail-otter/backend-runtime/config', () => ({
  ConfigurationManager: {
    digest: {
      getPackageTrackingApiKey: vi.fn(() => ''),
      getFlightTrackingApiKey: vi.fn(() => ''),
    },
  },
}));

vi.mock('@mail-otter/shared/utils', () => ({
  TimestampUtil: {
    getCurrentUnixTimestampInSeconds: vi.fn(() => NOW),
  },
  CryptoUtil: {
    hmacSha256Hex: vi.fn(async () => 'hashed'),
  },
  UUIDUtil: {
    getRandomUUID: vi.fn(() => 'exec-uuid'),
  },
}));

vi.mock('@mail-otter/provider-clients/gmail', () => ({
  GmailProviderUtil: { createCalendarEvent: vi.fn(), createDraftReply: vi.fn() },
}));
vi.mock('@mail-otter/provider-clients/outlook', () => ({
  OutlookProviderUtil: { createCalendarEvent: vi.fn(), createDraftReply: vi.fn() },
}));
vi.mock('../../packages/backend-services/src/oauth2/OAuth2AccessTokenService', () => ({
  OAuth2AccessTokenService: vi.fn(function () {
    return { getAccessToken: vi.fn(async () => 'access-token') };
  }),
}));
vi.mock('../../packages/backend-services/src/action/PackageTrackingService', () => ({
  fetchStatus: vi.fn(),
}));
vi.mock('../../packages/backend-services/src/action/FlightTrackingService', () => ({
  fetchFlightStatus: vi.fn(),
  formatFlightSummary: vi.fn(),
}));

import { snoozeAction, scheduleAction, executeScheduledActions } from '../../packages/backend-services/src/action/ActionSchedulingService';

const NOW = 1_778_200_000;
const FUTURE = NOW + 3600;
const FAR_FUTURE = NOW + 30 * 24 * 3600 + 1;

function makeEnv() {
  return {
    DB: {} as D1Database,
    ACTION_ENCRYPTION_KEY_SECRET: { get: async () => 'test-key' } as SecretsStoreSecret,
    ACTION_SIGNING_SECRET: { get: async () => 'test-sign' } as SecretsStoreSecret,
    AES_ENCRYPTION_KEY_SECRET: { get: async () => 'test-aes' } as SecretsStoreSecret,
    OAUTH2_TOKEN_CACHE: {} as KVNamespace,
    OAUTH2_TOKEN_REFRESHERS: {} as DurableObjectNamespace,
  };
}

function makePendingAction(overrides: Record<string, unknown> = {}) {
  return {
    actionId: 'action-1',
    userEmail: 'user@example.com',
    applicationId: 'app-1',
    status: 'pending',
    actionType: 'calendar.add_event',
    expiresAt: FUTURE + 86_400,
    ...overrides,
  };
}

describe('snoozeAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetForUser.mockResolvedValue(makePendingAction());
    mockSnoozeAction.mockResolvedValue(true);
    mockCancelSnooze.mockResolvedValue(true);
  });

  it('snoozes a pending action with a future timestamp', async () => {
    const snoozedUntil = new Date((NOW + 3600) * 1000);
    mockGetForUser.mockResolvedValueOnce(makePendingAction()).mockResolvedValueOnce(makePendingAction({ snoozedUntil: NOW + 3600 }));
    const result = await snoozeAction(makeEnv(), 'action-1', 'user@example.com', snoozedUntil);
    expect(mockSnoozeAction).toHaveBeenCalledWith('action-1', NOW + 3600, NOW + 3600 + 86_400);
    expect(result.status).toBe('pending');
  });

  it('cancels snooze when snoozedUntil is null', async () => {
    mockGetForUser.mockResolvedValue(makePendingAction({ snoozedUntil: FUTURE }));
    await snoozeAction(makeEnv(), 'action-1', 'user@example.com', null);
    expect(mockCancelSnooze).toHaveBeenCalledWith('action-1');
    expect(mockSnoozeAction).not.toHaveBeenCalled();
  });

  it('throws when action is not found', async () => {
    mockGetForUser.mockResolvedValue(undefined);
    await expect(snoozeAction(makeEnv(), 'action-1', 'user@example.com', new Date((NOW + 3600) * 1000))).rejects.toThrow('not found');
  });

  it('throws when action is not pending', async () => {
    mockGetForUser.mockResolvedValue(makePendingAction({ status: 'succeeded' }));
    await expect(snoozeAction(makeEnv(), 'action-1', 'user@example.com', new Date((NOW + 3600) * 1000))).rejects.toThrow('pending');
  });

  it('throws when snoozedUntil is in the past', async () => {
    const past = new Date((NOW - 1) * 1000);
    await expect(snoozeAction(makeEnv(), 'action-1', 'user@example.com', past)).rejects.toThrow('future');
  });

  it('throws when snoozedUntil exceeds 30 days', async () => {
    const tooFar = new Date(FAR_FUTURE * 1000);
    await expect(snoozeAction(makeEnv(), 'action-1', 'user@example.com', tooFar)).rejects.toThrow('30 days');
  });
});

describe('scheduleAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetForUser.mockResolvedValue(makePendingAction());
    mockScheduleAction.mockResolvedValue(true);
    mockCancelSchedule.mockResolvedValue(true);
  });

  it('schedules an auto-executable action', async () => {
    const scheduledFor = new Date((NOW + 3600) * 1000);
    mockGetForUser.mockResolvedValueOnce(makePendingAction()).mockResolvedValueOnce(makePendingAction({ scheduledFor: NOW + 3600 }));
    const result = await scheduleAction(makeEnv(), 'action-1', 'user@example.com', scheduledFor);
    expect(mockScheduleAction).toHaveBeenCalledWith('action-1', NOW + 3600, NOW + 3600 + 3600);
    expect(result).toBeDefined();
  });

  it('cancels a schedule when scheduledFor is null', async () => {
    mockGetForUser.mockResolvedValue(makePendingAction({ scheduledFor: FUTURE }));
    await scheduleAction(makeEnv(), 'action-1', 'user@example.com', null);
    expect(mockCancelSchedule).toHaveBeenCalledWith('action-1');
    expect(mockScheduleAction).not.toHaveBeenCalled();
  });

  it('throws for non-auto-executable action types', async () => {
    mockGetForUser.mockResolvedValue(makePendingAction({ actionType: 'finance.pay_bill' }));
    await expect(scheduleAction(makeEnv(), 'action-1', 'user@example.com', new Date((NOW + 3600) * 1000))).rejects.toThrow(
      'does not support',
    );
  });

  it('throws when action is not found', async () => {
    mockGetForUser.mockResolvedValue(undefined);
    await expect(scheduleAction(makeEnv(), 'action-1', 'user@example.com', new Date((NOW + 3600) * 1000))).rejects.toThrow('not found');
  });

  it('throws when scheduledFor is in the past', async () => {
    const past = new Date((NOW - 1) * 1000);
    await expect(scheduleAction(makeEnv(), 'action-1', 'user@example.com', past)).rejects.toThrow('future');
  });

  it('throws when scheduledFor exceeds 30 days', async () => {
    const tooFar = new Date(FAR_FUTURE * 1000);
    await expect(scheduleAction(makeEnv(), 'action-1', 'user@example.com', tooFar)).rejects.toThrow('30 days');
  });
});

describe('executeScheduledActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPendingScheduledActions.mockResolvedValue([]);
    mockClaimForExecution.mockResolvedValue(true);
    mockMarkSucceeded.mockResolvedValue(undefined);
    mockMarkFailed.mockResolvedValue(undefined);
    mockRecordExecution.mockResolvedValue({});
  });

  it('returns zero counts when there are no scheduled actions', async () => {
    const result = await executeScheduledActions(makeEnv());
    expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
  });

  it('executes scheduled calendar actions and counts successes', async () => {
    const action = makePendingAction({ expiresAt: NOW + 86_400 });
    mockListPendingScheduledActions.mockResolvedValue([action]);
    mockClaimForExecution.mockResolvedValue(true);
    mockGetById.mockResolvedValue({ ...action, providerId: 'google-gmail' });
    const { GmailProviderUtil } = await import('@mail-otter/provider-clients/gmail');
    vi.mocked(GmailProviderUtil.createCalendarEvent).mockResolvedValue({ summary: 'Event created.' });
    mockGetForUser.mockResolvedValue({ ...action, status: 'succeeded' });

    const result = await executeScheduledActions(makeEnv());
    expect(result.attempted).toBe(1);
  });

  it('counts a failed execution as failed', async () => {
    const action = makePendingAction({ expiresAt: NOW + 86_400 });
    mockListPendingScheduledActions.mockResolvedValue([action]);
    mockClaimForExecution.mockResolvedValue(true);
    mockMarkFailed.mockResolvedValue(undefined);
    mockGetById.mockResolvedValue({ ...action, providerId: 'google-gmail' });
    const { GmailProviderUtil } = await import('@mail-otter/provider-clients/gmail');
    vi.mocked(GmailProviderUtil.createCalendarEvent).mockRejectedValue(new Error('Provider error'));
    mockGetForUser.mockResolvedValue({ ...action, status: 'failed' });

    const result = await executeScheduledActions(makeEnv());
    expect(result.attempted).toBe(1);
    expect(result.failed).toBe(1);
  });
});
