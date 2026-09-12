import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailActionQueries } from '@mail-otter/backend-data/dao';

vi.mock('@mail-otter/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mail-otter/shared/utils')>();
  return { ...actual, UUIDUtil: { getRandomUUID: () => 'e-1' } };
});

function makeDb(handlers: { all?: (sql: string) => unknown[]; first?: (sql: string) => unknown; run?: (sql: string) => { changes: number } }) {
  const calls: string[] = [];
  return {
    calls,
    db: {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          all: vi.fn(async () => {
            calls.push(sql);
            return { results: handlers.all?.(sql) ?? [] };
          }),
          first: vi.fn(async () => {
            calls.push(sql);
            return handlers.first?.(sql) ?? null;
          }),
          run: vi.fn(async () => {
            calls.push(sql);
            return { success: true, meta: handlers.run?.(sql) ?? { changes: 0 } };
          }),
        })),
      })),
    },
  };
}

const execRow = {
  execution_id: 'e-1',
  action_id: 'a-1',
  attempt: 2,
  triggered_by: 'user',
  status: 'succeeded',
  provider_operation_id: 'op-1',
  request_user_agent_hash: null,
  error_message: null,
  created_at: 100,
  completed_at: 101,
};

describe('EmailActionQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts by status and type, scoped to application when given', async () => {
    const seen: string[] = [];
    const { db } = makeDb({
      all: (sql) => {
        seen.push(sql);
        if (sql.includes('GROUP BY status')) return [{ status: 'pending', cnt: 2 }];
        return [{ action_type: 'x', cnt: 2 }];
      },
    });
    const queries = new EmailActionQueries(db as never);
    const scoped = await queries.getCountsByUserAndDateRange('u@x', 1, 2, 'app-1');
    expect(scoped).toEqual({ byStatus: { pending: 2 }, byType: { x: 2 } });
    expect(seen[0]).toContain('application_id = ?');
    const { db: db2 } = makeDb({ all: () => [] });
    const unscoped = await new EmailActionQueries(db2 as never).getCountsByUserAndDateRange('u@x', 1, 2);
    expect(unscoped).toEqual({ byStatus: {}, byType: {} });
  });

  it('records executions with auto attempt and returns the new row', async () => {
    const { db } = makeDb({
      first: (sql) => (sql.includes('COUNT(*)') ? { count: 1 } : null),
      all: () => [execRow],
    });
    const execution = await new EmailActionQueries(db as never).recordExecution({
      actionId: 'a-1',
      triggeredBy: 'user',
      status: 'succeeded',
    });
    expect(execution).toMatchObject({ executionId: 'e-1', attempt: 2 });
  });

  it('records executions with explicit attempt and truncates long errors', async () => {
    const bound: unknown[][] = [];
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn((...args: unknown[]) => {
          bound.push(args);
          return {
            run: vi.fn(async () => ({ success: true, meta: { changes: 1 } })),
            all: vi.fn(async () => ({ results: [{ ...execRow, attempt: 5 }] })),
            first: vi.fn(async () => null),
          };
        }),
      })),
    };
    const execution = await new EmailActionQueries(db as never).recordExecution({
      actionId: 'a-1',
      triggeredBy: 'system',
      status: 'failed',
      attempt: 5,
      errorMessage: 'x'.repeat(2000),
    });
    expect(execution.attempt).toBe(5);
    expect((bound[0][7] as string)).toHaveLength(1024);
  });

  it('throws when the execution row cannot be reloaded', async () => {
    const { db } = makeDb({ first: () => ({ count: 0 }), all: () => [] });
    await expect(
      new EmailActionQueries(db as never).recordExecution({ actionId: 'a-1', triggeredBy: 'user', status: 'succeeded' }),
    ).rejects.toThrow('Failed to load email action execution after create.');
  });

  it('lists executions mapped to the public shape', async () => {
    const { db } = makeDb({ all: () => [execRow] });
    const list = await new EmailActionQueries(db as never).listExecutions('a-1');
    expect(list.executions).toHaveLength(1);
    expect(list.executions[0]).toMatchObject({ executionId: 'e-1', triggeredBy: 'user' });
  });

  it('reads and writes sync status', async () => {
    const ran: string[] = [];
    const { db } = makeDb({ first: () => ({ sync_status: 'synced', sync_updated_at: 9 }) });
    const queries = new EmailActionQueries(db as never);
    await queries.updateSyncStatus('a-1', 'synced');
    await expect(queries.getSyncStatus('a-1')).resolves.toEqual({ syncStatus: 'synced', syncUpdatedAt: 9 });
    const { db: db2 } = makeDb({ first: () => null });
    await expect(new EmailActionQueries(db2 as never).getSyncStatus('missing')).resolves.toBeUndefined();
    expect(ran).toEqual([]);
  });

  it('deletes old terminal actions and returns change count', async () => {
    const { db } = makeDb({ run: () => ({ changes: 4 }) });
    const deleted = await new EmailActionQueries(db as never).deleteOlderThan(100, 50, ['succeeded', 'failed']);
    expect(deleted).toBe(4);
  });
});
