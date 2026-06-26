import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNow = 1_778_200_000;
const mockUUID = 'run-uuid-1';

vi.mock('@mail-otter/shared/utils', () => ({
  TimestampUtil: { getCurrentUnixTimestampInSeconds: vi.fn(() => mockNow) },
  UUIDUtil: { getRandomUUID: vi.fn(() => mockUUID) },
}));

import { BackgroundTaskRunDAO } from '@mail-otter/backend-data/dao';

function makeDb(overrides?: { firstResult?: unknown; allResults?: unknown[]; runMeta?: { changes: number } }): D1Database {
  const runFn = vi.fn().mockResolvedValue({ success: true, meta: overrides?.runMeta ?? { changes: 1 } });
  const firstFn = vi.fn().mockResolvedValue(overrides?.firstResult ?? null);
  const allFn = vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] });
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
    })),
  };
}

function makeRunRow(overrides?: Record<string, unknown>) {
  return {
    run_id: mockUUID,
    task_type: 'calendar_sync',
    application_id: 'app-1',
    status: 'success',
    items_processed: 5,
    items_failed: 0,
    summary: 'Synced 5 events',
    details: null,
    error_message: null,
    started_at: mockNow - 30,
    completed_at: mockNow,
    created_at: mockNow - 30,
    ...overrides,
  };
}

describe('BackgroundTaskRunDAO', () => {
  let dao: BackgroundTaskRunDAO;
  let db: D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDb();
    dao = new BackgroundTaskRunDAO(db);
  });

  describe('startRun', () => {
    it('inserts a running record and returns the runId', async () => {
      const runId = await dao.startRun({ taskType: 'calendar_sync', applicationId: 'app-1' });
      expect(runId).toBe(mockUUID);
      expect((db.prepare as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });

    it('accepts undefined applicationId', async () => {
      const runId = await dao.startRun({ taskType: 'some_task' });
      expect(runId).toBe(mockUUID);
    });
  });

  describe('succeedRun', () => {
    it('updates status to success when no failures', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ run: runFn })),
        })),
      };
      dao = new BackgroundTaskRunDAO(db);

      await dao.succeedRun(mockUUID, { itemsProcessed: 5, itemsFailed: 0 });
      expect(runFn).toHaveBeenCalled();
    });

    it('updates status to partial_success when some failures exist', async () => {
      const bindFn = vi.fn();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: bindFn.mockReturnValue({ run: runFn }),
        })),
      };
      dao = new BackgroundTaskRunDAO(db);

      await dao.succeedRun(mockUUID, { itemsProcessed: 5, itemsFailed: 2, summary: 'partial' });
      const bindArgs = bindFn.mock.calls[0];
      expect(bindArgs[0]).toBe('partial_success');
    });

    it('serializes details as JSON', async () => {
      const bindFn = vi.fn();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: bindFn.mockReturnValue({ run: runFn }),
        })),
      };
      dao = new BackgroundTaskRunDAO(db);

      await dao.succeedRun(mockUUID, {
        itemsProcessed: 1,
        itemsFailed: 0,
        details: { indexed: 3 },
      });
      // bind args: status, itemsProcessed, itemsFailed, summary, details, completedAt, runId
      const allArgs: unknown[] = bindFn.mock.calls[0];
      const detailsArg = allArgs.find((a) => typeof a === 'string' && a.startsWith('{'));
      expect(detailsArg).toBe(JSON.stringify({ indexed: 3 }));
    });
  });

  describe('failRun', () => {
    it('marks run as error with error message', async () => {
      const bindFn = vi.fn();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: bindFn.mockReturnValue({ run: runFn }),
        })),
      };
      dao = new BackgroundTaskRunDAO(db);

      await dao.failRun(mockUUID, 'Something exploded', { itemsProcessed: 2, itemsFailed: 1 });
      expect(bindFn.mock.calls[0][0]).toBe('Something exploded');
    });

    it('uses defaults when partial input is omitted', async () => {
      const bindFn = vi.fn();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: bindFn.mockReturnValue({ run: runFn }),
        })),
      };
      dao = new BackgroundTaskRunDAO(db);

      await dao.failRun(mockUUID, 'Error');
      expect(bindFn.mock.calls[0][1]).toBe(0); // itemsProcessed
      expect(bindFn.mock.calls[0][2]).toBe(0); // itemsFailed
    });
  });

  describe('skipRun', () => {
    it('marks run as skipped with optional reason', async () => {
      const bindFn = vi.fn();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: bindFn.mockReturnValue({ run: runFn }),
        })),
      };
      dao = new BackgroundTaskRunDAO(db);

      await dao.skipRun(mockUUID, 'no-op');
      expect(bindFn.mock.calls[0][0]).toBe('no-op');
    });

    it('uses null reason when none provided', async () => {
      const bindFn = vi.fn();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: bindFn.mockReturnValue({ run: runFn }),
        })),
      };
      dao = new BackgroundTaskRunDAO(db);

      await dao.skipRun(mockUUID);
      expect(bindFn.mock.calls[0][0]).toBeNull();
    });
  });

  describe('listForUser', () => {
    it('returns empty list when no runs', async () => {
      const result = await dao.listForUser('user@example.com');
      expect(result.runs).toHaveLength(0);
      expect(result.nextCursor).toBeUndefined();
    });

    it('returns mapped runs', async () => {
      db = makeDb({ allResults: [makeRunRow()] });
      dao = new BackgroundTaskRunDAO(db);

      const result = await dao.listForUser('user@example.com');
      expect(result.runs).toHaveLength(1);
      expect(result.runs[0].runId).toBe(mockUUID);
      expect(result.runs[0].taskType).toBe('calendar_sync');
      expect(result.runs[0].status).toBe('success');
      expect(result.runs[0].itemsProcessed).toBe(5);
    });

    it('parses JSON details when present', async () => {
      db = makeDb({ allResults: [makeRunRow({ details: '{"count":3}' })] });
      dao = new BackgroundTaskRunDAO(db);

      const result = await dao.listForUser('user@example.com');
      expect(result.runs[0].details).toEqual({ count: 3 });
    });

    it('returns null details when details column is null', async () => {
      db = makeDb({ allResults: [makeRunRow({ details: null })] });
      dao = new BackgroundTaskRunDAO(db);

      const result = await dao.listForUser('user@example.com');
      expect(result.runs[0].details).toBeNull();
    });

    it('provides nextCursor when more rows than limit', async () => {
      const rows = Array.from({ length: 26 }, (_, i) =>
        makeRunRow({ run_id: `run-${i}`, started_at: mockNow - i }),
      );
      db = makeDb({ allResults: rows });
      dao = new BackgroundTaskRunDAO(db);

      const result = await dao.listForUser('user@example.com', { limit: 25 });
      expect(result.runs).toHaveLength(25);
      expect(result.nextCursor).toBeDefined();
    });

    it('applies cursor to filter older entries', async () => {
      const cursor = btoa(JSON.stringify({ startedAt: mockNow - 100, runId: 'some-run' }));
      db = makeDb({ allResults: [] });
      dao = new BackgroundTaskRunDAO(db);

      const result = await dao.listForUser('user@example.com', { cursor });
      expect(result.runs).toHaveLength(0);
    });

    it('filters by taskType', async () => {
      db = makeDb({ allResults: [] });
      dao = new BackgroundTaskRunDAO(db);

      await dao.listForUser('user@example.com', { taskType: 'calendar_sync' });
      expect((db.prepare as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });

    it('filters by applicationId', async () => {
      db = makeDb({ allResults: [] });
      dao = new BackgroundTaskRunDAO(db);

      await dao.listForUser('user@example.com', { applicationId: 'app-1' });
      expect((db.prepare as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });

    it('filters by status', async () => {
      db = makeDb({ allResults: [] });
      dao = new BackgroundTaskRunDAO(db);

      await dao.listForUser('user@example.com', { status: 'error' });
      expect((db.prepare as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });

    it('uses latestPerType query when no taskType specified', async () => {
      db = makeDb({ allResults: [makeRunRow()] });
      dao = new BackgroundTaskRunDAO(db);

      const result = await dao.listForUser('user@example.com', { latestPerType: true });
      expect(result.runs).toHaveLength(1);
      expect(result.nextCursor).toBeUndefined();
    });

    it('ignores latestPerType when taskType is specified', async () => {
      db = makeDb({ allResults: [] });
      dao = new BackgroundTaskRunDAO(db);

      const result = await dao.listForUser('user@example.com', { latestPerType: true, taskType: 'calendar_sync' });
      expect(result.runs).toHaveLength(0);
    });

    it('ignores invalid cursor gracefully', async () => {
      const result = await dao.listForUser('user@example.com', { cursor: 'not-valid-base64!!!' });
      expect(result.runs).toHaveLength(0);
    });

    it('clamps limit to 50', async () => {
      const rows = Array.from({ length: 51 }, (_, i) => makeRunRow({ run_id: `run-${i}` }));
      db = makeDb({ allResults: rows });
      dao = new BackgroundTaskRunDAO(db);

      const result = await dao.listForUser('user@example.com', { limit: 200 });
      expect(result.runs).toHaveLength(50);
    });
  });

  describe('pruneOldRuns', () => {
    it('returns number of deleted rows', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 7 } });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ run: runFn })),
        })),
      };
      dao = new BackgroundTaskRunDAO(db);

      const count = await dao.pruneOldRuns(mockNow - 86_400 * 30, 500);
      expect(count).toBe(7);
    });

    it('returns 0 when nothing deleted', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ run: runFn })),
        })),
      };
      dao = new BackgroundTaskRunDAO(db);

      const count = await dao.pruneOldRuns(mockNow - 86_400 * 30, 500);
      expect(count).toBe(0);
    });
  });
});
