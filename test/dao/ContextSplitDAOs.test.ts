import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mail-otter/shared/utils', () => ({
  TimestampUtil: { getCurrentUnixTimestampInSeconds: vi.fn(() => 1_778_200_000) },
  UUIDUtil: { getRandomUUID: vi.fn(() => 'uuid-1') },
}));

import { ContextAuditLogDAO } from '@mail-otter/backend-data/dao';
import { ContextDeletionRunDAO } from '@mail-otter/backend-data/dao';
import { ApplicationContextDAO } from '@mail-otter/backend-data/dao';

function makeDb(fns: { run?: ReturnType<typeof vi.fn>; first?: ReturnType<typeof vi.fn>; all?: ReturnType<typeof vi.fn> }): D1Database {
  const runFn = fns.run ?? vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
  const firstFn = fns.first ?? vi.fn().mockResolvedValue(null);
  const allFn = fns.all ?? vi.fn().mockResolvedValue({ results: [] });
  return {
    prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })) })),
  } as unknown as D1Database;
}

describe('Context split DAOs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ContextAuditLogDAO deletes old logs and returns changes', async () => {
    const run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 3 } });
    const dao = new ContextAuditLogDAO(makeDb({ run }));
    await expect(dao.deleteOldAuditLogs(100, 500)).resolves.toBe(3);
    expect(run).toHaveBeenCalled();
  });

  it('ContextAuditLogDAO lists logs with pagination', async () => {
    const all = vi.fn().mockResolvedValue({
      results: [
        {
          id: 'log-1', context_document_id: 'doc-1', application_id: 'app-1', user_email: 'u@e.com',
          source_document_id: 'src-1', event_type: 'indexed', event_label: null, event_data: null,
          severity: 'info', created_at: 100,
        },
      ],
    });
    const dao = new ContextAuditLogDAO(makeDb({ all }));
    const page = await dao.listAuditLogs('doc-1');
    expect(page.logs).toHaveLength(1);
    expect(page.logs[0].contextDocumentId).toBe('doc-1');
  });

  it('ContextDeletionRunDAO deletes old runs', async () => {
    const run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 2 } });
    const dao = new ContextDeletionRunDAO(makeDb({ run }));
    await expect(dao.deleteOldDeletionRuns(100, 500)).resolves.toBe(2);
  });

  it('ApplicationContextDAO delegates audit/deletion-run calls (facade)', async () => {
    const run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 4 } });
    const dao = new ApplicationContextDAO(makeDb({ run }));
    await expect(dao.deleteOldAuditLogs(100, 500)).resolves.toBe(4);
    await expect(dao.deleteOldDeletionRuns(100, 500)).resolves.toBe(4);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
