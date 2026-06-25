import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNow = 1_778_200_000;
const mockUUID = 'exec-uuid-1';
const mockEncryptedPayload = { encrypted: 'payload-enc', iv: 'payload-iv', salt: 'payload-salt' };
const mockEncryptedResult = { encrypted: 'result-enc', iv: 'result-iv', salt: 'result-salt' };
const mockDecryptedPayload = JSON.stringify({ title: 'Test Action', description: 'Desc' });
const mockDecryptedResult = JSON.stringify({ status: 'ok' });

vi.mock('@mail-otter/backend-data/crypto', () => ({
  encryptDataWithSalt: vi.fn((data: string) => {
    if (data.includes('title')) return Promise.resolve(mockEncryptedPayload);
    return Promise.resolve(mockEncryptedResult);
  }),
  decryptDataWithSalt: vi.fn((enc: string) => {
    if (enc === mockEncryptedPayload.encrypted) return Promise.resolve(mockDecryptedPayload);
    return Promise.resolve(mockDecryptedResult);
  }),
}));

vi.mock('@mail-otter/shared/utils', () => ({
  TimestampUtil: { getCurrentUnixTimestampInSeconds: vi.fn(() => mockNow) },
  UUIDUtil: { getRandomUUID: vi.fn(() => mockUUID) },
}));

import { EmailActionDAO } from '@mail-otter/backend-data/dao';
import type { EmailActionInternal, EmailActionExecutionInternal } from '@mail-otter/shared/model';
import type { D1Result } from '@mail-otter/shared/constants';

function createActionRow(overrides?: Partial<EmailActionInternal>): EmailActionInternal {
  return {
    action_id: 'action-1',
    processed_message_id: 'pm-1',
    application_id: 'app-1',
    user_email: 'user@example.com',
    provider_id: 'google-gmail',
    provider_message_id: 'msg-1',
    provider_thread_id: null,
    action_type: 'reply',
    status: 'pending',
    risk_level: 'low',
    token_hash: 'hash-1',
    encrypted_payload: mockEncryptedPayload.encrypted,
    payload_iv: mockEncryptedPayload.iv,
    payload_salt: mockEncryptedPayload.salt,
    encrypted_result: null,
    result_iv: null,
    result_salt: null,
    error_message: null,
    expires_at: mockNow + 86_400,
    executed_at: null,
    created_at: mockNow,
    updated_at: mockNow,
    ...overrides,
  };
}

function createExecutionRow(overrides?: Partial<EmailActionExecutionInternal>): EmailActionExecutionInternal {
  return {
    execution_id: mockUUID,
    action_id: 'action-1',
    attempt: 1,
    triggered_by: 'user',
    status: 'pending',
    provider_operation_id: null,
    request_user_agent_hash: null,
    error_message: null,
    created_at: mockNow,
    completed_at: mockNow,
    ...overrides,
  };
}

function makeDb(dbFns: {
  run?: ReturnType<typeof vi.fn>;
  first?: ReturnType<typeof vi.fn>;
  all?: ReturnType<typeof vi.fn>;
}): D1Database {
  const runFn = dbFns.run ?? vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
  const firstFn = dbFns.first ?? vi.fn().mockResolvedValue(null);
  const allFn = dbFns.all ?? vi.fn().mockResolvedValue({ results: [] } as D1Result);
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
    })),
  };
}

describe('EmailActionDAO', () => {
  let dao: EmailActionDAO;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('creates and returns an action', async () => {
      const row = createActionRow({ encrypted_result: null, result_iv: null, result_salt: null });
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const firstFn = vi.fn().mockResolvedValue(row);
      const db = makeDb({ run: runFn, first: firstFn });
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.create({
        actionId: 'action-1',
        processedMessageId: 'pm-1',
        applicationId: 'app-1',
        userEmail: 'user@example.com',
        providerId: 'google-gmail',
        providerMessageId: 'msg-1',
        actionType: 'reply',
        riskLevel: 'low',
        tokenHash: 'hash-1',
        payload: { title: 'Test', description: 'Desc' },
        expiresAt: mockNow + 86_400,
      });

      expect(result.actionId).toBe('action-1');
      expect(result.status).toBe('pending');
    });
  });

  describe('listActionsForUser', () => {
    it('returns empty list when no actions', async () => {
      const db = makeDb({});
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.listActionsForUser('user@example.com');
      expect(result.actions).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('returns actions with cursor', async () => {
      const rows = [
        createActionRow({ updated_at: mockNow, created_at: mockNow }),
        createActionRow({ action_id: 'action-2', updated_at: mockNow - 100, created_at: mockNow - 100 }),
      ];
      const db = makeDb({ all: vi.fn().mockResolvedValue({ results: rows } as D1Result) });
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.listActionsForUser('user@example.com', { limit: 1 });
      expect(result.actions).toHaveLength(1);
      expect(result.nextCursor).toBeDefined();
    });

    it('filters by applicationId and status', async () => {
      const db = makeDb({ all: vi.fn().mockResolvedValue({ results: [] } as D1Result) });
      dao = new EmailActionDAO(db, 'key');

      await dao.listActionsForUser('user@example.com', { applicationId: 'app-1', status: 'pending' });
    });

    it('parses cursor for pagination', async () => {
      const cursor = btoa(JSON.stringify({ updatedAt: mockNow, createdAt: mockNow }));
      const db = makeDb({ all: vi.fn().mockResolvedValue({ results: [] } as D1Result) });
      dao = new EmailActionDAO(db, 'key');

      await dao.listActionsForUser('user@example.com', { cursor });
    });
  });

  describe('getForUser', () => {
    it('returns action when found', async () => {
      const row = createActionRow();
      const db = makeDb({ first: vi.fn().mockResolvedValue(row) });
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.getForUser('action-1', 'user@example.com');
      expect(result?.actionId).toBe('action-1');
    });

    it('returns undefined when not found', async () => {
      const db = makeDb({});
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.getForUser('nonexistent', 'user@example.com');
      expect(result).toBeUndefined();
    });
  });

  describe('getByTokenHash', () => {
    it('returns action when token matches', async () => {
      const row = createActionRow();
      const db = makeDb({ first: vi.fn().mockResolvedValue(row) });
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.getByTokenHash('action-1', 'hash-1');
      expect(result?.actionId).toBe('action-1');
    });
  });

  describe('claimForExecution', () => {
    it('returns true when claim succeeds', async () => {
      const db = makeDb({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result) });
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.claimForExecution('action-1');
      expect(result).toBe(true);
    });

    it('returns false when claim fails', async () => {
      const db = makeDb({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } } as D1Result) });
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.claimForExecution('action-1');
      expect(result).toBe(false);
    });
  });

  describe('markSucceeded', () => {
    it('updates action with result', async () => {
      const db = makeDb({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result) });
      dao = new EmailActionDAO(db, 'key');

      await dao.markSucceeded('action-1', { status: 'ok' });
    });
  });

  describe('markFailed', () => {
    it('updates action with error', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const db = makeDb({ run: runFn });
      dao = new EmailActionDAO(db, 'key');

      await dao.markFailed('action-1', 'error message');
    });
  });

  describe('markExpired', () => {
    it('updates action to expired', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const db = makeDb({ run: runFn });
      dao = new EmailActionDAO(db, 'key');

      await dao.markExpired('action-1');
    });
  });

  describe('expirePendingActions', () => {
    it('returns count of expired actions', async () => {
      const db = makeDb({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 5 } } as D1Result) });
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.expirePendingActions(mockNow, 100);
      expect(result).toBe(5);
    });
  });

  describe('deleteByProcessedMessageId', () => {
    it('deletes pending actions for a processed message', async () => {
      const db = makeDb({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 2 } } as D1Result) });
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.deleteByProcessedMessageId('pm-1');
      expect(result).toBe(2);
    });
  });

  describe('deleteOlderThan', () => {
    it('deletes old non-pending actions', async () => {
      const db = makeDb({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 3 } } as D1Result) });
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.deleteOlderThan(mockNow - 86_400 * 30, 100);
      expect(result).toBe(3);
    });
  });

  describe('recordExecution', () => {
    it('records execution and returns it', async () => {
      const row = createExecutionRow();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } } as D1Result);
      const allFn = vi.fn().mockResolvedValue({ results: [row] } as D1Result);
      const firstFn = vi.fn().mockResolvedValue(null);
      const db = makeDb({ run: runFn, all: allFn, first: firstFn });
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.recordExecution({
        actionId: 'action-1',
        triggeredBy: 'user',
        status: 'pending',
      });

      expect(result.executionId).toBe(mockUUID);
    });
  });

  describe('listExecutions', () => {
    it('returns execution list', async () => {
      const rows = [createExecutionRow()];
      const db = makeDb({ all: vi.fn().mockResolvedValue({ results: rows } as D1Result) });
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.listExecutions('action-1');
      expect(result.executions).toHaveLength(1);
      expect(result.executions[0].executionId).toBe(mockUUID);
    });
  });

  describe('listExecutionsForUser', () => {
    it('returns executions when user owns the action', async () => {
      const row = createActionRow();
      const execRows = [createExecutionRow()];
      const firstFn = vi.fn().mockResolvedValue(row);
      const allFn = vi.fn().mockResolvedValue({ results: execRows } as D1Result);
      const db = makeDb({ first: firstFn, all: allFn });
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.listExecutionsForUser('action-1', 'user@example.com');
      expect(result.executions).toHaveLength(1);
    });

    it('returns empty when user does not own the action', async () => {
      const db = makeDb({});
      dao = new EmailActionDAO(db, 'key');

      const result = await dao.listExecutionsForUser('action-1', 'other@example.com');
      expect(result.executions).toEqual([]);
    });
  });
});
