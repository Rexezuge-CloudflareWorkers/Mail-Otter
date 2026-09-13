import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import { CursorUtil } from '@mail-otter/backend-data/utils';

function makeDb(responses: { all?: unknown[]; first?: unknown }) {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  return {
    calls,
    db: {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...bindings: unknown[]) => ({
          all: vi.fn(async () => {
            calls.push({ sql, bindings });
            return { results: responses.all ?? [] };
          }),
          first: vi.fn(async () => {
            calls.push({ sql, bindings });
            return responses.first ?? null;
          }),
          run: vi.fn(async () => ({ success: true, meta: { changes: 1 } })),
        })),
      })),
    },
  };
}

function row(ts: number, id = `pm-${ts}`) {
  return {
    processed_message_id: id,
    application_id: 'app-1',
    provider_id: 'google-gmail',
    provider_message_id: `m-${ts}`,
    provider_thread_id: null,
    provider_stable_message_fingerprint: null,
    status: 'summarized',
    summary_sent_at: ts,
    error_message: null,
    created_at: ts,
    updated_at: ts,
  };
}

describe('ProcessedMessageDAO analytics and listing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates daily and total counts with success rate', async () => {
    const { db, calls } = makeDb({
      all: [{ day: '2026-09-01', summarized: 3, skipped: 1, error: 1 }],
      first: { summarized: 3, skipped: 1, error: 1 },
    });
    const result = await new ProcessedMessageDAO(db as never).getStatusCountsByDateRange(100, 200);
    expect(result.daily).toEqual([{ date: '2026-09-01', summarized: 3, skipped: 1, error: 1 }]);
    expect(result.total).toEqual({ summarized: 3, skipped: 1, error: 1, successRate: 0.6 });
    expect(calls[0].sql).not.toContain('application_id = ?');
  });

  it('scopes counts to an application and handles empty totals', async () => {
    const { db, calls } = makeDb({ all: [], first: null });
    const result = await new ProcessedMessageDAO(db as never).getStatusCountsByDateRange(100, 200, 'app-1');
    expect(result.total).toEqual({ summarized: 0, skipped: 0, error: 0, successRate: 0 });
    expect(calls[0].bindings).toContain('app-1');
  });

  it('lists with filters, pagination cursor, and limit clamping', async () => {
    const { db, calls } = makeDb({ all: [row(300), row(200), row(100)] });
    const result = await new ProcessedMessageDAO(db as never).listForUser('u@x', {
      applicationId: 'app-1',
      status: 'summarized',
      limit: 2,
    });
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].providerMessageId).toBe('m-300');
    expect(result.nextCursor).toBeDefined();
    expect(calls[0].bindings.at(-1)).toBe(3);
    const { db: db2, calls: calls2 } = makeDb({ all: [row(300)] });
    await new ProcessedMessageDAO(db2 as never).listForUser('u@x', { limit: 500 });
    expect(calls2[0].bindings.at(-1)).toBe(51);
  });

  it('resumes from a valid cursor and ignores corrupt ones', async () => {
    const cursor = CursorUtil.encode({ createdAt: 250, processedMessageId: 'pm-250' });
    const { db, calls } = makeDb({ all: [row(200)] });
    const resumed = await new ProcessedMessageDAO(db as never).listForUser('u@x', { cursor });
    expect(resumed.messages).toHaveLength(1);
    expect(resumed.nextCursor).toBeUndefined();
    expect(calls[0].bindings).toEqual(expect.arrayContaining([250, 250, 'pm-250']));
    const { db: db2 } = makeDb({ all: [row(200)] });
    const fresh = await new ProcessedMessageDAO(db2 as never).listForUser('u@x', { cursor: 'bogus' });
    expect(fresh.messages).toHaveLength(1);
  });
});
