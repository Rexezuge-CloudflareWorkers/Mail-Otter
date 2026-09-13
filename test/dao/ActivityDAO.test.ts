import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityDAO } from '@mail-otter/backend-data/dao';
import { CursorUtil } from '@mail-otter/backend-data/utils';

function makeDb(queues: Record<string, unknown[]>) {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  return {
    calls,
    db: {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...bindings: unknown[]) => ({
          all: vi.fn(async () => {
            calls.push({ sql, bindings });
            const key = sql.includes('processed_messages')
              ? 'processed'
              : sql.includes('email_action_executions')
                ? 'executed'
                : 'created';
            return { results: queues[key] ?? [] };
          }),
        })),
      })),
    },
  };
}

const processedRow = {
  application_id: 'app-1',
  provider_message_id: 'm-1',
  status: 'summarized',
  error_message: null,
  created_at: 300,
};
const createdRow = { action_id: 'a-1', application_id: 'app-1', action_type: 'x', risk_level: 'low', created_at: 200 };
const executedRow = {
  execution_id: 'e-1',
  action_id: 'a-1',
  application_id: 'app-1',
  action_type: 'x',
  status: 'succeeded',
  triggered_by: 'user',
  created_at: 100,
};

describe('ActivityDAO', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges the three feeds sorted by timestamp descending', async () => {
    const { db } = makeDb({ processed: [processedRow], created: [createdRow], executed: [executedRow] });
    const result = await new ActivityDAO(db as never).listForUser('user@example.com', {});
    expect(result.entries.map((e) => e.timestamp)).toEqual([300, 200, 100]);
    expect(result.entries[0]).toMatchObject({ eventType: 'email_processed', providerMessageId: 'm-1' });
    expect(result.nextCursor).toBeUndefined();
  });

  it('paginates with limit and nextCursor', async () => {
    const rows = [500, 400, 300].map((ts) => ({ ...processedRow, created_at: ts }));
    const { db } = makeDb({ processed: rows, created: [], executed: [] });
    const result = await new ActivityDAO(db as never).listForUser('user@example.com', { limit: 2 });
    expect(result.entries).toHaveLength(2);
    expect(result.nextCursor).toBeDefined();
    const decoded = CursorUtil.decode<{ beforeTs: number }>(result.nextCursor);
    expect(decoded?.beforeTs).toBe(400);
  });

  it('filters by type and application', async () => {
    const { db, calls } = makeDb({ processed: [], created: [createdRow], executed: [] });
    const result = await new ActivityDAO(db as never).listForUser('user@example.com', {
      types: ['action_created'],
      applicationId: 'app-1',
    });
    expect(result.entries).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('email_summary_actions');
  });

  it('applies cursor and clamps limits', async () => {
    const cursor = CursorUtil.encode({ beforeTs: 250 });
    const { db, calls } = makeDb({ processed: [processedRow], created: [], executed: [] });
    await new ActivityDAO(db as never).listForUser('user@example.com', { cursor, limit: 500 });
    expect(calls[0].bindings).toContain(250);
    expect(calls[0].bindings.at(-1)).toBe(101);
  });

  it('ignores corrupt cursors', async () => {
    const { db } = makeDb({ processed: [processedRow], created: [], executed: [] });
    const result = await new ActivityDAO(db as never).listForUser('user@example.com', { cursor: 'bogus' });
    expect(result.entries).toHaveLength(1);
  });
});
