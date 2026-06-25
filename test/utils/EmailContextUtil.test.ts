import { AiDailyUsageDAO } from '@mail-otter/backend-data/dao';
import { NonRetryableError } from '@mail-otter/backend-errors';
import { EmailContextUtil } from '@mail-otter/backend-services/email';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeStatement {
  private readonly database: FakeD1Database;
  private readonly sql: string;
  private bindings: unknown[] = [];

  constructor(database: FakeD1Database, sql: string) {
    this.database = database;
    this.sql = sql;
  }

  bind(...bindings: unknown[]): FakeStatement {
    this.bindings = bindings;
    this.database.boundStatements.push({ sql: this.sql, bindings });
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes('WHERE application_id = ? AND source_type = ? AND source_document_id = ?')) {
      return null;
    }
    return (this.database.documentRow || null) as T | null;
  }

  async run(): Promise<D1Result> {
    if (this.sql.includes('INSERT INTO application_context_documents')) {
      this.database.documentRow = {
        context_document_id: this.bindings[0] as string,
        application_id: this.bindings[1] as string,
        user_email: this.bindings[2] as string,
        source_type: this.bindings[3] as string,
        source_provider_id: this.bindings[4] as never,
        source_document_id: this.bindings[5] as string,
        source_thread_id: this.bindings[6] as string | null,
        vector_namespace: this.bindings[7] as string,
        vector_id: 'cd_test-vector',
        source_document_fingerprint: this.bindings[9] as string,
        source_thread_fingerprint: this.bindings[10] as string | null,
        title_fingerprint: this.bindings[11] as string | null,
        sender_fingerprint: this.bindings[12] as string | null,
        content_fingerprint: this.bindings[13] as string,
        indexed_text_chars: this.bindings[14] as number,
        status: this.bindings[15] as never,
        indexed_at: null,
        deleted_at: null,
        last_error: null,
        created_at: this.bindings[16] as number,
        updated_at: this.bindings[17] as number,
      };
    }
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
}

class FakeD1Database {
  public readonly boundStatements: Array<{ sql: string; bindings: unknown[] }> = [];
  public documentRow: Record<string, unknown> | undefined;

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }
}

describe('EmailContextUtil', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps plaintext email context out of D1 while preserving Vectorize metadata', async () => {
    const database = new FakeD1Database();
    const vectorize = {
      upsert: vi.fn().mockResolvedValue({ mutationId: 'mutation-1' }),
    };
    const ai = {
      run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] }),
    };
    const application: ConnectedApplication = {
      applicationId: '11111111-1111-4111-8111-111111111111',
      userEmail: 'owner@example.com',
      providerEmail: 'owner@example.com',
      displayName: 'Work inbox',
      providerId: 'google-gmail',
      connectionMethod: 'oauth2',
      status: 'connected',
      contextIndexingEnabled: true,
      createdAt: 1,
      updatedAt: 1,
      credentials: { clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' },
    };

    const incrementUsage = vi.spyOn(AiDailyUsageDAO.prototype, 'incrementUsage').mockResolvedValue();

    await EmailContextUtil.prepareEmailRagContext({
      env: {
        DB: database as unknown as D1Database,
        AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('test-secret') },
        AI: ai,
        EMAIL_CONTEXT_INDEX: vectorize,
      },
      application,
      enabledApplicationIds: [],
      subject: 'Quarterly roadmap',
      from: 'sender@example.com',
      body: 'A confidential plan for the next quarter.',
      sourceDocumentId: 'gmail-message-123',
      sourceThreadId: 'gmail-thread-456',
    });

    const allD1BindingText = database.boundStatements
      .flatMap((statement) => statement.bindings)
      .filter((binding): binding is string => typeof binding === 'string');
    expect(allD1BindingText.some((binding) => binding.includes('Quarterly roadmap'))).toBe(false);
    expect(allD1BindingText.some((binding) => binding.includes('sender@example.com'))).toBe(false);
    expect(allD1BindingText.some((binding) => binding.includes('confidential'))).toBe(false);
    expect(allD1BindingText).not.toContain('A confidential plan for the next quarter.');
    expect(allD1BindingText.some((binding) => binding.length === 64)).toBe(true);

    expect(vectorize.upsert).toHaveBeenCalledOnce();
    const vectorPayload = vi.mocked(vectorize.upsert).mock.calls[0]?.[0]?.[0];
    expect(vectorPayload?.metadata).toMatchObject({
      title: 'Quarterly roadmap',
      sender: 'sender@example.com',
    });
    expect(String(vectorPayload?.metadata?.indexedText)).toContain('A confidential plan for the next quarter.');

    expect(incrementUsage).toHaveBeenCalledWith({
      usageDate: expect.any(String),
      estimatedNeurons: 1,
      embeddingTokens: 30,
    });
  });

  it('skips context embedding when the local daily neuron estimate reached the threshold', async () => {
    vi.spyOn(AiDailyUsageDAO.prototype, 'getEstimatedNeuronsForDate').mockResolvedValue(6000);
    const incrementUsage = vi.spyOn(AiDailyUsageDAO.prototype, 'incrementUsage').mockResolvedValue();
    const database = new FakeD1Database();
    const vectorize = {
      upsert: vi.fn().mockResolvedValue({ mutationId: 'mutation-1' }),
    };
    const ai = {
      run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] }),
    };

    await expect(
      EmailContextUtil.prepareEmailRagContext({
        env: {
          DB: database as unknown as D1Database,
          AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('test-secret') } as unknown as SecretsStoreSecret,
          AI: ai as unknown as Ai,
          EMAIL_CONTEXT_INDEX: vectorize as unknown as Vectorize,
          AI_DAILY_NEURON_FALLBACK_THRESHOLD: '6000',
        },
        application: createApplication(),
        enabledApplicationIds: [],
        subject: 'Quarterly roadmap',
        from: 'sender@example.com',
        body: 'A confidential plan for the next quarter.',
        sourceDocumentId: 'gmail-message-123',
        sourceThreadId: 'gmail-thread-456',
      }),
    ).resolves.toBeUndefined();

    expect(ai.run).not.toHaveBeenCalled();
    expect(vectorize.upsert).not.toHaveBeenCalled();
    expect(database.documentRow).toBeUndefined();
    expect(incrementUsage).not.toHaveBeenCalled();
  });

  it('rethrows Workers AI embedding free allocation exhaustion as non-retryable', async () => {
    const database = new FakeD1Database();
    const vectorize = {
      upsert: vi.fn().mockResolvedValue({ mutationId: 'mutation-1' }),
    };
    const ai = {
      run: vi.fn().mockRejectedValue(new Error('4006: you have used up your daily free allocation of 10,000 neurons')),
    };

    await expect(
      EmailContextUtil.prepareEmailRagContext({
        env: {
          DB: database as unknown as D1Database,
          AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('test-secret') } as unknown as SecretsStoreSecret,
          AI: ai as unknown as Ai,
          EMAIL_CONTEXT_INDEX: vectorize as unknown as Vectorize,
          AI_DAILY_NEURON_FALLBACK_THRESHOLD: '0',
        },
        application: createApplication(),
        enabledApplicationIds: [],
        subject: 'Quarterly roadmap',
        from: 'sender@example.com',
        body: 'A confidential plan for the next quarter.',
        sourceDocumentId: 'gmail-message-123',
        sourceThreadId: 'gmail-thread-456',
      }),
    ).rejects.toThrow(NonRetryableError);

    expect(vectorize.upsert).not.toHaveBeenCalled();
  });
});

function createApplication(): ConnectedApplication {
  return {
    applicationId: '11111111-1111-4111-8111-111111111111',
    userEmail: 'owner@example.com',
    providerEmail: 'owner@example.com',
    displayName: 'Work inbox',
    providerId: 'google-gmail',
    connectionMethod: 'oauth2',
    status: 'connected',
    contextIndexingEnabled: true,
    createdAt: 1,
    updatedAt: 1,
    credentials: { clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' },
  };
}
