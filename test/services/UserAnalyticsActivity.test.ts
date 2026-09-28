/**
User-scoped calls take the account identity: id for ownership, anchor for stored keys.
*/
const TEST_SCOPE = { id: 'usr_0123456789abcdef0123456789abcdef', anchorEmail: 'user@example.com' };

import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_USER_ID = 'usr_0123456789abcdef0123456789abcdef';

const {
  mockUpsertByEmail,
  mockGetByEmail,
  mockGetById,
  mockGetRowByEmail,
  mockGetByCurrentEmail,
  mockCreateUser,
  mockRegistryGet,
  mockRegistryRegister,
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
  mockGetById: vi.fn(),
  mockGetRowByEmail: vi.fn(),
  mockGetByCurrentEmail: vi.fn(),
  mockCreateUser: vi.fn().mockResolvedValue(undefined),
  mockRegistryGet: vi.fn().mockResolvedValue(null),
  mockRegistryRegister: vi.fn().mockResolvedValue('claimed'),
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
  scopeForAnchor: (anchorEmail: string) => ({ id: null, anchorEmail }),
  userScopeSql: (scope: { id: string | null; anchorEmail: string }) =>
    scope.id
      ? { clause: '(user_id = ? OR (user_id IS NULL AND user_email = ?))', bindings: [scope.id, scope.anchorEmail] }
      : { clause: 'user_email = ?', bindings: [scope.anchorEmail] },
  UserDAO: Object.assign(
    vi.fn(function () {
      return {
        upsertByEmail: mockUpsertByEmail,
        getByEmail: mockGetByEmail,
        getById: mockGetById,
        getRowByEmail: mockGetRowByEmail,
        getByCurrentEmail: mockGetByCurrentEmail,
        createUser: mockCreateUser,
        updatePreferredLanguage: mockUpdatePreferredLanguage,
      };
    }),
    // Statics: `registerAccount` mints the id and the opaque anchor through these.
    { newId: () => TEST_USER_ID, newAnchor: () => 'anchor-0123456789abcdef0123456789abcdef@users.invalid' },
  ),
  UserEmailDAO: vi.fn(function () {
    return { get: mockRegistryGet, register: mockRegistryRegister };
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
    return { getCountsByUserScope: mockGetCountsByUserEmail };
  }),
  ActivityDAO: vi.fn(function () {
    return { listForUser: mockListForUser };
  }),
}));

import { UserService, UserServiceFactory } from '@mail-otter/backend-services/user';
import { AnalyticsService } from '@mail-otter/backend-services/analytics';
import { ActivityService } from '@mail-otter/backend-services/activity';
import { NotFoundError } from '@mail-otter/backend-errors';

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
    mockGetById.mockResolvedValue(null);
    mockGetRowByEmail.mockResolvedValue(null);
    mockGetByCurrentEmail.mockResolvedValue(null);
    mockRegistryGet.mockResolvedValue(null);
    mockCreateUser.mockClear();
    mockRegistryRegister.mockResolvedValue('claimed');
  });

  it('resolves an existing account instead of creating a second one', async () => {
    // The invariant that makes an address change safe: an address that already
    // belongs to an account resolves to that account and mints nothing.
    mockRegistryGet.mockResolvedValue({ email: 'user@example.com', user_id: TEST_USER_ID, is_verified: 1, created_at: 0 });
    mockGetById.mockResolvedValue({
      id: TEST_USER_ID,
      email: 'user@example.com',
      current_email: 'user@example.com',
    });
    const account = await new UserService(userEnv()).upsertUser('user@example.com');
    expect(account).toEqual({ id: TEST_USER_ID, email: 'user@example.com', anchorEmail: 'user@example.com' });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('never resolves a revoked address to the previous holder', async () => {
    // A released address must not keep authenticating whoever held it before.
    mockRegistryGet.mockResolvedValue({ email: 'user@example.com', user_id: TEST_USER_ID, is_verified: 0, created_at: 0 });
    mockCreateUser.mockResolvedValue(undefined);
    mockRegistryRegister.mockResolvedValue('claimed');
    // A new account is created, and it does not inherit the old id.
    const account = await new UserService(userEnv()).upsertUser('user@example.com');
    expect(account.id).not.toBe(TEST_USER_ID);
  });

  it('creates the account on first sight and returns the new identity', async () => {
    mockRegistryGet.mockResolvedValue(null);
    mockGetByCurrentEmail.mockResolvedValue(null);
    mockGetRowByEmail.mockResolvedValue(null);
    // After the insert the address resolves to the freshly created account.
    mockRegistryGet.mockImplementation(async (email: string) =>
      mockCreateUser.mock.calls.length > 0 ? { email, user_id: TEST_USER_ID, is_verified: 1, created_at: 0 } : null,
    );
    mockGetById.mockResolvedValue({ id: TEST_USER_ID, email: 'user@example.com', current_email: 'user@example.com' });
    const account = await new UserService(userEnv()).upsertUser('user@example.com');
    expect(mockCreateUser).toHaveBeenCalledOnce();
    expect(account.id).toBe(TEST_USER_ID);
  });

  it('resolves the account id for a write path that has to stamp user_id', async () => {
    // Write paths use this so a row keeps belonging to the account after it
    // changes address. With a shared resolver injected it must go through that
    // instance, so one request resolves a caller once.
    const sharedResolveUserId = vi.fn().mockResolvedValue(TEST_USER_ID);
    const service = new UserService(userEnv(), { userIdentity: async () => ({ resolveUserId: sharedResolveUserId }) as never });
    expect(await service.resolveUserId('user@example.com')).toBe(TEST_USER_ID);
    expect(sharedResolveUserId).toHaveBeenCalledWith('user@example.com');
  });

  it('falls back to the shared resolution when no identity service is injected', async () => {
    mockRegistryGet.mockResolvedValue({ email: 'user@example.com', user_id: TEST_USER_ID, is_verified: 1, created_at: 0 });
    mockGetById.mockResolvedValue({ id: TEST_USER_ID, email: 'user@example.com', current_email: 'user@example.com' });
    expect(await new UserService(userEnv()).resolveUserId('user@example.com')).toBe(TEST_USER_ID);

    mockRegistryGet.mockResolvedValue(null);
    mockGetByCurrentEmail.mockResolvedValue(null);
    mockGetRowByEmail.mockResolvedValue(null);
    expect(await new UserService(userEnv()).resolveUserId('nobody@example.com')).toBeNull();
  });

  it('builds through the exported factory with only the env', async () => {
    // The standalone path has to work: no composition root, so the default DAO
    // factories are built from a bare env and the optional `userIdentity` is
    // simply absent rather than throwing.
    const service = UserServiceFactory.create(userEnv());
    const summary = await service.getCurrentUserSummary();
    expect(summary.limits.maxApplicationsPerUser).toBeGreaterThan(0);
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
    mockGetRowByEmail.mockResolvedValue({ id: TEST_USER_ID, email: 'user@example.com', preferred_language: 'DE' });
    mockGetByDate.mockResolvedValue({ estimatedNeurons: 42 });
    const summary = await new UserService(userEnv()).getCurrentUserSummary('user@example.com');
    expect(summary.preferredLanguage).toBe('de');
    expect(summary.aiUsage.estimatedNeurons).toBe(42);
  });

  it('falls back to null language when the user lookup fails', async () => {
    mockRegistryGet.mockRejectedValue(new Error('db down'));
    mockGetByCurrentEmail.mockRejectedValue(new Error('db down'));
    mockGetRowByEmail.mockRejectedValue(new Error('db down'));
    const summary = await new UserService(userEnv()).getCurrentUserSummary('user@example.com');
    expect(summary.preferredLanguage).toBeNull();
  });

  it('falls back to null language when the user has none set', async () => {
    mockGetRowByEmail.mockResolvedValue({ id: TEST_USER_ID, email: 'user@example.com', preferred_language: null });
    const summary = await new UserService(userEnv()).getCurrentUserSummary('user@example.com');
    expect(summary.preferredLanguage).toBeNull();
  });

  it('updates the preferred language and returns the normalized value', async () => {
    // Resolves the account first, then writes through the frozen anchor, which is
    // the `users` primary key and the only column a pre-0028 database has.
    mockRegistryGet.mockResolvedValue({ email: 'user@example.com', user_id: TEST_USER_ID, is_verified: 1, created_at: 0 });
    mockGetById.mockResolvedValue({ id: TEST_USER_ID, email: 'user@example.com', current_email: 'user@example.com' });
    const normalized = await new UserService(userEnv()).updatePreferredLanguage('user@example.com', 'FR');
    expect(normalized).toBe('fr');
    expect(mockUpdatePreferredLanguage).toHaveBeenCalledWith('user@example.com', 'fr');
  });

  it('reads the preferred language without throwing for missing users', async () => {
    mockGetRowByEmail.mockResolvedValue({ id: TEST_USER_ID, email: 'user@example.com', preferred_language: 'DE' });
    await expect(new UserService(userEnv()).getPreferredLanguage('user@example.com')).resolves.toBe('de');
    mockGetRowByEmail.mockResolvedValue(null);
    await expect(new UserService(userEnv()).getPreferredLanguage('user@example.com')).resolves.toBeNull();
    mockGetRowByEmail.mockRejectedValue(new Error('db down'));
    await expect(new UserService(userEnv()).getPreferredLanguage('user@example.com')).resolves.toBeNull();
  });
});

describe('AnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMetadataByIdForUser.mockResolvedValue({ applicationId: 'app-1' });
    mockGetByDateRange.mockResolvedValue([]);
  });

  it('throws NotFoundError when the scoped application is missing', async () => {
    mockGetMetadataByIdForUser.mockResolvedValue(null);
    await expect(new AnalyticsService(analyticsEnv()).getAnalytics(TEST_SCOPE, { days: 7, applicationId: 'nope' })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('aggregates AI usage totals and daily rows', async () => {
    mockGetByDateRange.mockResolvedValue([
      { usageDate: '2026-09-01', estimatedNeurons: 10, requestCount: 2 },
      { usageDate: '2026-09-02', estimatedNeurons: 20, requestCount: 3 },
    ]);
    mockGetStatusCountsByDateRange.mockResolvedValue({ processed: 5 });
    mockGetCountsByUserAndDateRange.mockResolvedValue({ pending: 1 });
    mockGetCountsByUserEmail.mockResolvedValue({ documents: 4 });

    const result = await new AnalyticsService(analyticsEnv()).getAnalytics(TEST_SCOPE, {
      days: 7,
      applicationId: 'app-1',
    });

    expect(mockGetMetadataByIdForUser).toHaveBeenCalledWith('app-1', TEST_SCOPE);
    expect(result.aiUsage.total).toEqual({ estimatedNeurons: 30, requestCount: 5 });
    expect(result.aiUsage.daily).toHaveLength(2);
    expect(result.processing).toEqual({ processed: 5 });
    expect(result.actions).toEqual({ pending: 1 });
    expect(result.context).toEqual({ documents: 4 });
  });

  it('skips the application check when no applicationId is given', async () => {
    await new AnalyticsService(analyticsEnv()).getAnalytics(TEST_SCOPE, { days: 30 });
    expect(mockGetMetadataByIdForUser).not.toHaveBeenCalled();
    expect(mockGetStatusCountsByDateRange).toHaveBeenCalled();
  });

  it('returns zero totals when there are no AI rows', async () => {
    mockGetByDateRange.mockResolvedValue([]);
    const result = await new AnalyticsService(analyticsEnv()).getAnalytics(TEST_SCOPE, { days: 1 });
    expect(result.aiUsage.total).toEqual({ estimatedNeurons: 0, requestCount: 0 });
    expect(result.aiUsage.daily).toEqual([]);
  });
});

describe('ActivityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists activity with the default limit', async () => {
    await ActivityService.listActivity(TEST_SCOPE, {}, { DB: {} as D1Database });
    expect(mockListForUser).toHaveBeenCalledWith(TEST_SCOPE, {
      applicationId: undefined,
      cursor: undefined,
      limit: 50,
      types: undefined,
    });
  });

  it('caps the limit at 100 entries', async () => {
    await ActivityService.listActivity(TEST_SCOPE, { limit: 500 }, { DB: {} as D1Database });
    expect(mockListForUser).toHaveBeenCalledWith(TEST_SCOPE, expect.objectContaining({ limit: 100 }));
  });

  it('passes through filters', async () => {
    await ActivityService.listActivity(
      TEST_SCOPE,
      { applicationId: 'app-1', cursor: 'cur', limit: 10, types: ['email_processed'] },
      { DB: {} as D1Database },
    );
    expect(mockListForUser).toHaveBeenCalledWith(TEST_SCOPE, {
      applicationId: 'app-1',
      cursor: 'cur',
      limit: 10,
      types: ['email_processed'],
    });
  });
});
