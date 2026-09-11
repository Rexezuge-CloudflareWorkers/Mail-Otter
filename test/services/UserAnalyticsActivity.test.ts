import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockUpsertByEmail,
  mockGetByEmail,
  mockUpdatePreferredLanguage,
  mockGetByDate,
  mockGetMetadataByIdForUser,
  mockGetByDateRange,
  mockGetStatusCountsByDateRange,
  mockGetCountsByUserAndDateRange,
  mockGetCountsByUserEmail,
  mockListForUser,
} = vi.hoisted(() => ({
  mockUpsertByEmail: vi.fn().mockResolvedValue(undefined),
  mockGetByEmail: vi.fn(),
  mockUpdatePreferredLanguage: vi.fn().mockResolvedValue(undefined),
  mockGetByDate: vi.fn(),
  mockGetMetadataByIdForUser: vi.fn(),
  mockGetByDateRange: vi.fn().mockResolvedValue([]),
  mockGetStatusCountsByDateRange: vi.fn().mockResolvedValue({}),
  mockGetCountsByUserAndDateRange: vi.fn().mockResolvedValue({}),
  mockGetCountsByUserEmail: vi.fn().mockResolvedValue({}),
  mockListForUser: vi.fn().mockResolvedValue({ entries: [], nextCursor: undefined }),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  UserDAO: vi.fn(function () {
    return {
      upsertByEmail: mockUpsertByEmail,
      getByEmail: mockGetByEmail,
      updatePreferredLanguage: mockUpdatePreferredLanguage,
    };
  }),
  AiDailyUsageDAO: vi.fn(function () {
    return { getByDate: mockGetByDate, getByDateRange: mockGetByDateRange };
  }),
  ConnectedApplicationDAO: vi.fn(function () {
    return { getMetadataByIdForUser: mockGetMetadataByIdForUser };
  }),
  ProcessedMessageDAO: vi.fn(function () {
    return { getStatusCountsByDateRange: mockGetStatusCountsByDateRange };
  }),
  EmailActionDAO: vi.fn(function () {
    return { getCountsByUserAndDateRange: mockGetCountsByUserAndDateRange };
  }),
  ApplicationContextDAO: vi.fn(function () {
    return { getCountsByUserEmail: mockGetCountsByUserEmail };
  }),
  ActivityDAO: vi.fn(function () {
    return { listForUser: mockListForUser };
  }),
}));

import { UserService } from '@mail-otter/backend-services/user';
import { AnalyticsService } from '@mail-otter/backend-services/analytics';
import { ActivityService } from '@mail-otter/backend-services/activity';
import { BadRequestError } from '@mail-otter/backend-errors';

function userEnv(extra: Record<string, unknown> = {}) {
  return { DB: {} as D1Database, ...extra };
}

function analyticsEnv() {
  return {
    DB: {} as D1Database,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master-key') } as unknown as SecretsStoreSecret,
    ACTION_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('action-key') } as unknown as SecretsStoreSecret,
  };
}

describe('UserService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByDate.mockResolvedValue(null);
    mockGetByEmail.mockResolvedValue(null);
  });

  it('upserts a user by email', async () => {
    await new UserService(userEnv()).upsertUser('user@example.com');
    expect(mockUpsertByEmail).toHaveBeenCalledWith('user@example.com');
  });

  it('returns summary with null language when no email is given', async () => {
    const summary = await new UserService(userEnv()).getCurrentUserSummary();
    expect(summary.preferredLanguage).toBeNull();
    expect(summary.aiUsage.estimatedNeurons).toBe(0);
    expect(summary.limits.maxApplicationsPerUser).toBeGreaterThan(0);
    expect(summary.aiUsage.dailyNeuronLimit).toBeGreaterThan(0);
    expect(mockGetByEmail).not.toHaveBeenCalled();
  });

  it('returns normalized language and recorded usage', async () => {
    mockGetByEmail.mockResolvedValue({ preferredLanguage: 'DE' });
    mockGetByDate.mockResolvedValue({ estimatedNeurons: 42 });
    const summary = await new UserService(userEnv()).getCurrentUserSummary('user@example.com');
    expect(summary.preferredLanguage).toBe('de');
    expect(summary.aiUsage.estimatedNeurons).toBe(42);
  });

  it('falls back to null language when the user lookup fails', async () => {
    mockGetByEmail.mockRejectedValue(new Error('db down'));
    const summary = await new UserService(userEnv()).getCurrentUserSummary('user@example.com');
    expect(summary.preferredLanguage).toBeNull();
  });

  it('falls back to null language when the user has none set', async () => {
    mockGetByEmail.mockResolvedValue({ preferredLanguage: null });
    const summary = await new UserService(userEnv()).getCurrentUserSummary('user@example.com');
    expect(summary.preferredLanguage).toBeNull();
  });

  it('updates the preferred language and returns the normalized value', async () => {
    const normalized = await new UserService(userEnv()).updatePreferredLanguage('user@example.com', 'FR');
    expect(normalized).toBe('fr');
    expect(mockUpsertByEmail).toHaveBeenCalledWith('user@example.com');
    expect(mockUpdatePreferredLanguage).toHaveBeenCalledWith('user@example.com', 'fr');
  });
});

describe('AnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMetadataByIdForUser.mockResolvedValue({ applicationId: 'app-1' });
    mockGetByDateRange.mockResolvedValue([]);
  });

  it('throws BadRequestError when the scoped application is missing', async () => {
    mockGetMetadataByIdForUser.mockResolvedValue(null);
    await expect(
      new AnalyticsService(analyticsEnv()).getAnalytics('user@example.com', { days: 7, applicationId: 'nope' }),
    ).rejects.toThrow(BadRequestError);
  });

  it('aggregates AI usage totals and daily rows', async () => {
    mockGetByDateRange.mockResolvedValue([
      { usageDate: '2026-09-01', estimatedNeurons: 10, requestCount: 2 },
      { usageDate: '2026-09-02', estimatedNeurons: 20, requestCount: 3 },
    ]);
    mockGetStatusCountsByDateRange.mockResolvedValue({ processed: 5 });
    mockGetCountsByUserAndDateRange.mockResolvedValue({ pending: 1 });
    mockGetCountsByUserEmail.mockResolvedValue({ documents: 4 });

    const result = await new AnalyticsService(analyticsEnv()).getAnalytics('user@example.com', {
      days: 7,
      applicationId: 'app-1',
    });

    expect(mockGetMetadataByIdForUser).toHaveBeenCalledWith('app-1', 'user@example.com');
    expect(result.aiUsage.total).toEqual({ estimatedNeurons: 30, requestCount: 5 });
    expect(result.aiUsage.daily).toHaveLength(2);
    expect(result.processing).toEqual({ processed: 5 });
    expect(result.actions).toEqual({ pending: 1 });
    expect(result.context).toEqual({ documents: 4 });
  });

  it('skips the application check when no applicationId is given', async () => {
    await new AnalyticsService(analyticsEnv()).getAnalytics('user@example.com', { days: 30 });
    expect(mockGetMetadataByIdForUser).not.toHaveBeenCalled();
    expect(mockGetStatusCountsByDateRange).toHaveBeenCalled();
  });

  it('returns zero totals when there are no AI rows', async () => {
    mockGetByDateRange.mockResolvedValue([]);
    const result = await new AnalyticsService(analyticsEnv()).getAnalytics('user@example.com', { days: 1 });
    expect(result.aiUsage.total).toEqual({ estimatedNeurons: 0, requestCount: 0 });
    expect(result.aiUsage.daily).toEqual([]);
  });
});

describe('ActivityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists activity with the default limit', async () => {
    await ActivityService.listActivity('user@example.com', {}, { DB: {} as D1Database });
    expect(mockListForUser).toHaveBeenCalledWith('user@example.com', {
      applicationId: undefined,
      cursor: undefined,
      limit: 50,
      types: undefined,
    });
  });

  it('caps the limit at 100 entries', async () => {
    await ActivityService.listActivity('user@example.com', { limit: 500 }, { DB: {} as D1Database });
    expect(mockListForUser).toHaveBeenCalledWith('user@example.com', expect.objectContaining({ limit: 100 }));
  });

  it('passes through filters', async () => {
    await ActivityService.listActivity(
      'user@example.com',
      { applicationId: 'app-1', cursor: 'cur', limit: 10, types: ['email_processed'] },
      { DB: {} as D1Database },
    );
    expect(mockListForUser).toHaveBeenCalledWith('user@example.com', {
      applicationId: 'app-1',
      cursor: 'cur',
      limit: 10,
      types: ['email_processed'],
    });
  });
});
