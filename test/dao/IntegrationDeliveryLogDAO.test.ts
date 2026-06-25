import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mail-otter/shared/utils', () => ({
  TimestampUtil: { getCurrentUnixTimestampInSeconds: vi.fn(() => 1_778_200_000) },
  UUIDUtil: { getRandomUUID: vi.fn(() => 'log-uuid-1') },
}));

import { IntegrationDeliveryLogDAO } from '@mail-otter/backend-data/dao';

const batchFn = vi.fn();

function makeDb(): D1Database {
  const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
  const allFn = vi.fn().mockResolvedValue({ results: [] });
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({ run: runFn, all: allFn })),
    })),
    batch: batchFn,
  };
}

describe('IntegrationDeliveryLogDAO', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchFn.mockResolvedValue([{ success: true }, { success: true }]);
  });

  describe('create', () => {
    it('batch-writes the delivery log and updates health columns', async () => {
      const db = makeDb();
      const dao = new IntegrationDeliveryLogDAO(db);
      const result = await dao.create({
        integrationId: 'int-1',
        applicationId: 'app-1',
        status: 'success',
        httpStatus: 200,
        errorMessage: null,
        emailSubject: 'Test Subject',
      });

      expect(batchFn).toHaveBeenCalledOnce();
      const stmts: unknown[] = batchFn.mock.calls[0][0];
      expect(stmts).toHaveLength(2);

      expect(result.logId).toBe('log-uuid-1');
      expect(result.integrationId).toBe('int-1');
      expect(result.applicationId).toBe('app-1');
      expect(result.status).toBe('success');
      expect(result.httpStatus).toBe(200);
      expect(result.errorMessage).toBeNull();
      expect(result.emailSubject).toBe('Test Subject');
      expect(result.createdAt).toBe(1_778_200_000);
    });

    it('handles failure status with error message', async () => {
      const db = makeDb();
      const dao = new IntegrationDeliveryLogDAO(db);
      const result = await dao.create({
        integrationId: 'int-2',
        applicationId: 'app-1',
        status: 'failure',
        httpStatus: 503,
        errorMessage: 'Service Unavailable',
        emailSubject: null,
      });

      expect(result.status).toBe('failure');
      expect(result.httpStatus).toBe(503);
      expect(result.errorMessage).toBe('Service Unavailable');
      expect(result.emailSubject).toBeNull();
    });
  });

  describe('listByIntegrationId', () => {
    it('returns mapped delivery logs', async () => {
      const db = makeDb();
      (db.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                log_id: 'log-1',
                integration_id: 'int-1',
                application_id: 'app-1',
                status: 'success',
                http_status: 200,
                error_message: null,
                email_subject: 'Hello',
                created_at: 1_778_200_000,
              },
            ],
          }),
        }),
      });
      const dao = new IntegrationDeliveryLogDAO(db);
      const logs = await dao.listByIntegrationId('int-1', 10);
      expect(logs).toHaveLength(1);
      expect(logs[0]?.logId).toBe('log-1');
      expect(logs[0]?.status).toBe('success');
      expect(logs[0]?.emailSubject).toBe('Hello');
    });

    it('returns empty array when no logs exist', async () => {
      const db = makeDb();
      const dao = new IntegrationDeliveryLogDAO(db);
      const logs = await dao.listByIntegrationId('int-none', 10);
      expect(logs).toHaveLength(0);
    });
  });

  describe('deleteOlderThan', () => {
    it('returns number of deleted rows', async () => {
      const db = makeDb();
      const dao = new IntegrationDeliveryLogDAO(db);
      const count = await dao.deleteOlderThan(1_778_100_000, 500);
      expect(count).toBe(1);
    });
  });
});
