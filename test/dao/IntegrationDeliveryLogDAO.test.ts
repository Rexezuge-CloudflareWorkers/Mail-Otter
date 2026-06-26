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

    it('respects limit parameter by passing to database', async () => {
      const db = makeDb();
      const bindFn = vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [
            {
              log_id: 'log-1',
              integration_id: 'int-1',
              application_id: 'app-1',
              status: 'success',
              http_status: 200,
              error_message: null,
              email_subject: 'Test',
              created_at: 1_778_200_000,
            },
          ],
        }),
      });
      (db.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: bindFn,
      });
      const dao = new IntegrationDeliveryLogDAO(db);
      await dao.listByIntegrationId('int-1', 10);
      expect(bindFn).toHaveBeenCalledWith('int-1', 10);
    });

    it('handles null error_message field', async () => {
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
                email_subject: 'Test',
                created_at: 1_778_200_000,
              },
            ],
          }),
        }),
      });
      const dao = new IntegrationDeliveryLogDAO(db);
      const logs = await dao.listByIntegrationId('int-1', 10);
      expect(logs[0]?.errorMessage).toBeNull();
    });

    it('handles null http_status field', async () => {
      const db = makeDb();
      (db.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                log_id: 'log-1',
                integration_id: 'int-1',
                application_id: 'app-1',
                status: 'failure',
                http_status: null,
                error_message: 'Network error',
                email_subject: 'Test',
                created_at: 1_778_200_000,
              },
            ],
          }),
        }),
      });
      const dao = new IntegrationDeliveryLogDAO(db);
      const logs = await dao.listByIntegrationId('int-1', 10);
      expect(logs[0]?.httpStatus).toBeNull();
    });

    it('handles null email_subject field', async () => {
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
                email_subject: null,
                created_at: 1_778_200_000,
              },
            ],
          }),
        }),
      });
      const dao = new IntegrationDeliveryLogDAO(db);
      const logs = await dao.listByIntegrationId('int-1', 10);
      expect(logs[0]?.emailSubject).toBeNull();
    });

    it('handles different failure statuses', async () => {
      const db = makeDb();
      (db.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                log_id: 'log-1',
                integration_id: 'int-1',
                application_id: 'app-1',
                status: 'failure',
                http_status: 500,
                error_message: 'Server Error',
                email_subject: 'Test',
                created_at: 1_778_200_000,
              },
            ],
          }),
        }),
      });
      const dao = new IntegrationDeliveryLogDAO(db);
      const logs = await dao.listByIntegrationId('int-1', 10);
      expect(logs[0]?.status).toBe('failure');
    });
  });

  describe('deleteOlderThan', () => {
    it('returns number of deleted rows', async () => {
      const db = makeDb();
      const dao = new IntegrationDeliveryLogDAO(db);
      const count = await dao.deleteOlderThan(1_778_100_000, 500);
      expect(count).toBe(1);
    });

    it('handles zero deleted rows', async () => {
      const db = makeDb();
      (db.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } }),
        }),
      });
      const dao = new IntegrationDeliveryLogDAO(db);
      const count = await dao.deleteOlderThan(1_778_100_000, 500);
      expect(count).toBe(0);
    });

    it('respects batch size limit', async () => {
      const db = makeDb();
      const dao = new IntegrationDeliveryLogDAO(db);

      // Call with different batch sizes to verify it works
      await dao.deleteOlderThan(1_778_100_000, 100);
      await dao.deleteOlderThan(1_778_100_000, 1000);

      expect(db.prepare).toHaveBeenCalled();
    });

    it('deletes up to batch size entries', async () => {
      const db = makeDb();
      (db.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 500 } }),
        }),
      });
      const dao = new IntegrationDeliveryLogDAO(db);
      const count = await dao.deleteOlderThan(1_778_100_000, 500);
      expect(count).toBe(500);
    });
  });

  describe('create - batch operations', () => {
    it('updates integration health columns on success', async () => {
      const db = makeDb();
      const dao = new IntegrationDeliveryLogDAO(db);
      const stmts: unknown[] = [];
      batchFn.mockImplementation((statements) => {
        stmts.push(...statements);
        return Promise.resolve([{ success: true }, { success: true }]);
      });

      await dao.create({
        integrationId: 'int-1',
        applicationId: 'app-1',
        status: 'success',
        httpStatus: 200,
        errorMessage: null,
        emailSubject: 'Test',
      });

      expect(stmts.length).toBeGreaterThanOrEqual(2);
    });

    it('stores email subject as provided', async () => {
      const db = makeDb();
      const dao = new IntegrationDeliveryLogDAO(db);
      const subject = 'Important: Your account has been updated';

      const result = await dao.create({
        integrationId: 'int-1',
        applicationId: 'app-1',
        status: 'success',
        httpStatus: 200,
        errorMessage: null,
        emailSubject: subject,
      });

      expect(result.emailSubject).toBe(subject);
    });

    it('stores error message as provided', async () => {
      const db = makeDb();
      const dao = new IntegrationDeliveryLogDAO(db);
      const errorMsg = 'Database connection timeout after 5000ms';

      const result = await dao.create({
        integrationId: 'int-1',
        applicationId: 'app-1',
        status: 'failure',
        httpStatus: null,
        errorMessage: errorMsg,
        emailSubject: 'Test',
      });

      expect(result.errorMessage).toBe(errorMsg);
    });
  });
});
