import { ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import {
  PROCESSED_MESSAGE_STATUS_ERROR,
  PROCESSED_MESSAGE_STATUS_PROCESSING,
  PROCESSED_MESSAGE_STATUS_SKIPPED,
  PROCESSED_MESSAGE_STATUS_SUMMARIZED,
  type ProcessedMessageStatus,
  type ProviderId,
} from '@mail-otter/shared/constants';
import type { ProcessedMessageInternal } from '@mail-otter/shared/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeProcessedMessageStatement {
  private bindings: unknown[] = [];

  constructor(
    private readonly database: FakeProcessedMessageD1Database,
    private readonly sql: string,
  ) {}

  bind(...bindings: unknown[]): FakeProcessedMessageStatement {
    this.bindings = bindings;
    return this;
  }

  async run(): Promise<D1Result> {
    if (this.sql.includes('INSERT OR IGNORE INTO processed_messages')) {
      const row: ProcessedMessageInternal = {
        processed_message_id: this.bindings[0] as string,
        application_id: this.bindings[1] as string,
        provider_id: this.bindings[2] as ProviderId,
        provider_message_id: this.bindings[3] as string,
        provider_thread_id: this.bindings[4] as string | null,
        provider_stable_message_fingerprint: this.bindings[5] as string | null,
        status: this.bindings[6] as ProcessedMessageStatus,
        summary_sent_at: null,
        error_message: null,
        created_at: this.bindings[7] as number,
        updated_at: this.bindings[8] as number,
      };
      if (this.database.conflictsWithExistingRow(row)) {
        return { success: true, meta: { changes: 0 } } as D1Result;
      }
      this.database.rows.push(row);
      return { success: true, meta: { changes: 1 } } as D1Result;
    }

    return { success: true, meta: { changes: 0 } } as D1Result;
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes('WHERE application_id = ? AND provider_message_id = ?')) {
      return (this.database.rows.find(
        (row: ProcessedMessageInternal): boolean =>
          row.application_id === this.bindings[0] && row.provider_message_id === this.bindings[1],
      ) || null) as T | null;
    }
    if (this.sql.includes('WHERE application_id = ? AND provider_id = ? AND provider_stable_message_fingerprint = ?')) {
      return (this.database.rows.find(
        (row: ProcessedMessageInternal): boolean =>
          row.application_id === this.bindings[0] &&
          row.provider_id === this.bindings[1] &&
          row.provider_stable_message_fingerprint === this.bindings[2],
      ) || null) as T | null;
    }
    return null;
  }
}

class FakeProcessedMessageD1Database {
  public readonly rows: ProcessedMessageInternal[] = [];

  prepare(sql: string): FakeProcessedMessageStatement {
    return new FakeProcessedMessageStatement(this, sql);
  }

  conflictsWithExistingRow(row: ProcessedMessageInternal): boolean {
    return this.rows.some((existingRow: ProcessedMessageInternal): boolean => {
      const sameProviderMessage =
        existingRow.application_id === row.application_id && existingRow.provider_message_id === row.provider_message_id;
      const sameStableProviderMessage =
        Boolean(row.provider_stable_message_fingerprint) &&
        existingRow.application_id === row.application_id &&
        existingRow.provider_id === row.provider_id &&
        existingRow.provider_stable_message_fingerprint === row.provider_stable_message_fingerprint;
      return sameProviderMessage || sameStableProviderMessage;
    });
  }
}

describe('ProcessedMessageDAO', () => {
  it('does not start a moved message when the stable provider message fingerprint already exists', async () => {
    const database = new FakeProcessedMessageD1Database();
    database.rows.push(createProcessedMessageRow({ provider_message_id: 'old-provider-id', provider_stable_message_fingerprint: 'stable-1' }));
    const dao = new ProcessedMessageDAO(database as unknown as D1Database);

    await expect(
      dao.tryStart('app-1', 'microsoft-outlook', 'new-provider-id', 'conversation-1', {
        providerStableMessageFingerprint: 'stable-1',
      }),
    ).resolves.toBe(false);

    expect(database.rows).toHaveLength(1);
  });

  it('starts a new message in the same thread when its stable provider message fingerprint is new', async () => {
    const database = new FakeProcessedMessageD1Database();
    database.rows.push(createProcessedMessageRow({ provider_message_id: 'old-provider-id', provider_stable_message_fingerprint: 'stable-1' }));
    const dao = new ProcessedMessageDAO(database as unknown as D1Database);

    await expect(
      dao.tryStart('app-1', 'microsoft-outlook', 'new-reply-provider-id', 'conversation-1', {
        providerStableMessageFingerprint: 'stable-2',
      }),
    ).resolves.toBe(true);

    expect(database.rows).toHaveLength(2);
    expect(database.rows[1]).toMatchObject({
      provider_message_id: 'new-reply-provider-id',
      provider_thread_id: 'conversation-1',
      provider_stable_message_fingerprint: 'stable-2',
      status: PROCESSED_MESSAGE_STATUS_PROCESSING,
    });
  });
});

function createProcessedMessageRow(overrides: Partial<ProcessedMessageInternal> = {}): ProcessedMessageInternal {
  return {
    processed_message_id: 'processed-message-1',
    application_id: 'app-1',
    provider_id: 'microsoft-outlook',
    provider_message_id: 'provider-message-1',
    provider_thread_id: 'conversation-1',
    provider_stable_message_fingerprint: 'stable-1',
    status: PROCESSED_MESSAGE_STATUS_SUMMARIZED,
    summary_sent_at: 1778200000,
    error_message: null,
    created_at: 1778200000,
    updated_at: 1778200000,
    ...overrides,
  };
}

function makeDb(overrides?: { firstResult?: unknown; runChanges?: number }) {
  const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: overrides?.runChanges ?? 1 } } as D1Result);
  const mockFirst = vi.fn().mockResolvedValue(overrides?.firstResult ?? null);
  return {
    db: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          run: mockRun,
          first: mockFirst,
        })),
      })),
    } as unknown as D1Database,
    mockRun,
    mockFirst,
  };
}

describe('ProcessedMessageDAO (mock-based)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('markSummarized', () => {
    it('executes UPDATE with summarized status and sets summary_sent_at', async () => {
      const { db, mockRun } = makeDb();
      const dao = new ProcessedMessageDAO(db);

      await dao.markSummarized('app-1', 'msg-1');

      expect(mockRun).toHaveBeenCalledTimes(1);
      const bindFn = (db.prepare as ReturnType<typeof vi.fn>).mock.results[0].value.bind as ReturnType<typeof vi.fn>;
      const bindings = bindFn.mock.calls[0] as unknown[];
      expect(bindings[0]).toBe(PROCESSED_MESSAGE_STATUS_SUMMARIZED);
      expect(bindings[1]).toBe(1);
    });
  });

  describe('markSkipped', () => {
    it('executes UPDATE with skipped status and sets error_message', async () => {
      const { db, mockRun } = makeDb();
      const dao = new ProcessedMessageDAO(db);

      await dao.markSkipped('app-1', 'msg-1', 'Already processed');

      expect(mockRun).toHaveBeenCalledTimes(1);
      const bindFn = (db.prepare as ReturnType<typeof vi.fn>).mock.results[0].value.bind as ReturnType<typeof vi.fn>;
      const bindings = bindFn.mock.calls[0] as unknown[];
      expect(bindings[0]).toBe(PROCESSED_MESSAGE_STATUS_SKIPPED);
      expect(bindings[3]).toBe('Already processed');
    });
  });

  describe('markError', () => {
    it('executes UPDATE with error status and sets error_message', async () => {
      const { db, mockRun } = makeDb();
      const dao = new ProcessedMessageDAO(db);

      await dao.markError('app-1', 'msg-1', 'Something went wrong');

      expect(mockRun).toHaveBeenCalledTimes(1);
      const bindFn = (db.prepare as ReturnType<typeof vi.fn>).mock.results[0].value.bind as ReturnType<typeof vi.fn>;
      const bindings = bindFn.mock.calls[0] as unknown[];
      expect(bindings[0]).toBe(PROCESSED_MESSAGE_STATUS_ERROR);
      expect(bindings[3]).toBe('Something went wrong');
    });

    it('truncates error messages longer than 1024 chars', async () => {
      const { db } = makeDb();
      const dao = new ProcessedMessageDAO(db);
      const longError = 'x'.repeat(2000);

      await dao.markError('app-1', 'msg-1', longError);

      const bindFn = (db.prepare as ReturnType<typeof vi.fn>).mock.results[0].value.bind as ReturnType<typeof vi.fn>;
      const bindings = bindFn.mock.calls[0] as unknown[];
      expect((bindings[3] as string).length).toBe(1024);
    });
  });

  describe('deleteOlderThan', () => {
    it('returns the number of deleted rows', async () => {
      const { db } = makeDb({ runChanges: 7 });
      const dao = new ProcessedMessageDAO(db);

      const count = await dao.deleteOlderThan(1000000, [PROCESSED_MESSAGE_STATUS_SUMMARIZED, PROCESSED_MESSAGE_STATUS_SKIPPED], 100);

      expect(count).toBe(7);
    });

    it('passes the correct bindings (timestamp, statuses, limit)', async () => {
      const { db } = makeDb();
      const dao = new ProcessedMessageDAO(db);

      await dao.deleteOlderThan(9999, [PROCESSED_MESSAGE_STATUS_ERROR], 50);

      const bindFn = (db.prepare as ReturnType<typeof vi.fn>).mock.results[0].value.bind as ReturnType<typeof vi.fn>;
      const bindings = bindFn.mock.calls[0] as unknown[];
      expect(bindings[0]).toBe(9999);
      expect(bindings[1]).toBe(PROCESSED_MESSAGE_STATUS_ERROR);
      expect(bindings[2]).toBe(50);
    });
  });

  describe('getLatestForApplication', () => {
    it('returns undefined when no summarized message exists', async () => {
      const { db } = makeDb({ firstResult: null });
      const dao = new ProcessedMessageDAO(db);

      const result = await dao.getLatestForApplication('app-1');

      expect(result).toBeUndefined();
    });

    it('maps database row to ProcessedMessage shape', async () => {
      const row = createProcessedMessageRow({ status: PROCESSED_MESSAGE_STATUS_SUMMARIZED });
      const { db } = makeDb({ firstResult: row });
      const dao = new ProcessedMessageDAO(db);

      const result = await dao.getLatestForApplication('app-1');

      expect(result).toMatchObject({
        processedMessageId: row.processed_message_id,
        applicationId: row.application_id,
        providerId: row.provider_id,
        providerMessageId: row.provider_message_id,
        status: PROCESSED_MESSAGE_STATUS_SUMMARIZED,
        summarySentAt: row.summary_sent_at,
      });
    });
  });

  describe('getLatestErrorForApplication', () => {
    it('returns undefined when no error message exists', async () => {
      const { db } = makeDb({ firstResult: null });
      const dao = new ProcessedMessageDAO(db);

      const result = await dao.getLatestErrorForApplication('app-1');

      expect(result).toBeUndefined();
    });

    it('maps error row to ProcessedMessage shape', async () => {
      const row = createProcessedMessageRow({ status: PROCESSED_MESSAGE_STATUS_ERROR, error_message: 'fail', summary_sent_at: null });
      const { db } = makeDb({ firstResult: row });
      const dao = new ProcessedMessageDAO(db);

      const result = await dao.getLatestErrorForApplication('app-1');

      expect(result).toMatchObject({
        status: PROCESSED_MESSAGE_STATUS_ERROR,
        errorMessage: 'fail',
      });
    });
  });

  describe('getByMessageId', () => {
    it('returns undefined when message does not exist', async () => {
      const { db } = makeDb({ firstResult: null });
      const dao = new ProcessedMessageDAO(db);

      const result = await dao.getByMessageId('app-1', 'msg-x');

      expect(result).toBeUndefined();
    });

    it('maps row to ProcessedMessage including providerThreadId and fingerprint', async () => {
      const row = createProcessedMessageRow({
        provider_thread_id: 'thread-99',
        provider_stable_message_fingerprint: 'fp-abc',
      });
      const { db } = makeDb({ firstResult: row });
      const dao = new ProcessedMessageDAO(db);

      const result = await dao.getByMessageId('app-1', 'provider-message-1');

      expect(result).toMatchObject({
        providerThreadId: 'thread-99',
        providerStableMessageFingerprint: 'fp-abc',
      });
    });
  });
});
