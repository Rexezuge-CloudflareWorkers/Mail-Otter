import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiDailyUsageDAO, OAuth2AccessTokenRefreshStatusDAO } from '@mail-otter/backend-data/dao';

function makeDb(firstResult: unknown = null, allResults: unknown[] = []) {
  const calls: string[] = [];
  const run = vi.fn(async () => {
    calls.push('run');
    return { success: true, meta: { changes: 1 } };
  });
  return {
    calls,
    db: {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          run,
          first: vi.fn(async () => {
            calls.push(`first:${sql.slice(0, 60)}`);
            return firstResult;
          }),
          all: vi.fn(async () => {
            calls.push(`all:${sql.slice(0, 60)}`);
            return { results: allResults };
          }),
        })),
      })),
    },
  };
}

describe('OAuth2AccessTokenRefreshStatusDAO', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when no status row exists', async () => {
    const { db } = makeDb(null);
    await expect(new OAuth2AccessTokenRefreshStatusDAO(db as never).getByApplication('app-1')).resolves.toBeUndefined();
  });

  it('maps a status row to the public shape', async () => {
    const { db } = makeDb({
      application_id: 'app-1',
      access_token_expires_at: 100,
      last_refresh_started_at: 90,
      last_refresh_succeeded_at: 95,
      last_refresh_failed_at: null,
      last_error: null,
      created_at: 80,
      updated_at: 96,
    });
    const status = await new OAuth2AccessTokenRefreshStatusDAO(db as never).getByApplication('app-1');
    expect(status).toMatchObject({ applicationId: 'app-1', accessTokenExpiresAt: 100, lastRefreshSucceededAt: 95 });
  });

  it('records start, success, and truncated failures', async () => {
    const { db, calls } = makeDb();
    const dao = new OAuth2AccessTokenRefreshStatusDAO(db as never);
    await dao.recordRefreshStarted('app-1');
    await dao.recordRefreshSuccess('app-1', 200);
    await dao.recordRefreshFailure('app-1', 'x'.repeat(2000));
    expect(calls.filter((c) => c === 'run')).toHaveLength(3);
  });

  it('lists due application ids', async () => {
    const { db } = makeDb(null, [{ application_id: 'a1' }, { application_id: 'a2' }]);
    const ids = await new OAuth2AccessTokenRefreshStatusDAO(db as never).listDueApplicationIds(100, 10);
    expect(ids).toEqual(['a1', 'a2']);
  });
});

describe('AiDailyUsageDAO', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined for missing dates and zero neurons', async () => {
    const { db } = makeDb(null, []);
    const dao = new AiDailyUsageDAO(db as never);
    await expect(dao.getByDate('2026-09-01')).resolves.toBeUndefined();
    await expect(dao.getByDateRange('2026-09-01', '2026-09-02')).resolves.toEqual([]);
    await expect(dao.getEstimatedNeuronsForDate('2026-09-01')).resolves.toBe(0);
  });

  it('maps usage rows and deletes old dates', async () => {
    const { db } = makeDb(
      { usage_date: '2026-09-01', estimated_neurons: 42, request_count: 3, prompt_tokens: 10, completion_tokens: 5 },
      [{ usage_date: '2026-09-01', estimated_neurons: 42, request_count: 3, prompt_tokens: 10, completion_tokens: 5 }],
    );
    const dao = new AiDailyUsageDAO(db as never);
    const day = await dao.getByDate('2026-09-01');
    expect(day).toMatchObject({ estimatedNeurons: 42 });
    await expect(dao.getByDateRange('2026-09-01', '2026-09-02')).resolves.toHaveLength(1);
    await expect(dao.getEstimatedNeuronsForDate('2026-09-01')).resolves.toBe(42);
    await expect(dao.deleteOlderThanDate('2026-01-01')).resolves.toBe(1);
  });

  it('increments usage', async () => {
    const { db, calls } = makeDb();
    await new AiDailyUsageDAO(db as never).incrementUsage({
      usageDate: '2026-09-01',
      estimatedNeurons: 5,
      promptTokens: 1,
      completionTokens: 1,
    });
    expect(calls).toContain('run');
  });
});
