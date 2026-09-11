import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeD1WithRetry: vi.fn(),
}));

vi.mock('../../packages/backend-data/src/utils/D1Utils', () => ({
  executeD1WithRetry: mocks.executeD1WithRetry,
}));

import { BaseDAO, EncryptedDAO } from '@mail-otter/backend-data/dao';

class TestDAO extends BaseDAO {
  public runWithRetry(operation: () => Promise<D1Result>, context: string): Promise<D1Result> {
    return this.withRetry(operation, context);
  }

  public getDatabase(): unknown {
    return this.database;
  }
}

class TestEncryptedDAO extends EncryptedDAO {
  public runWithRetry(operation: () => Promise<D1Result>, context: string): Promise<D1Result> {
    return this.withRetry(operation, context);
  }

  public getDatabase(): unknown {
    return this.database;
  }

  public getMasterKey(): string {
    return this.masterKey;
  }
}

function makeDb(): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(),
        first: vi.fn(),
        all: vi.fn(),
      })),
    })),
  };
}

describe('BaseDAO generics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores the database handle for subclasses', () => {
    const db = makeDb();
    expect(new TestDAO(db).getDatabase()).toBe(db);
  });

  it('delegates withRetry to executeD1WithRetry and returns its result', async () => {
    const dao = new TestDAO(makeDb());
    const operation = vi.fn().mockResolvedValue({ success: true });
    const expected = { success: true, meta: { changes: 1 } };
    mocks.executeD1WithRetry.mockResolvedValue(expected);

    await expect(dao.runWithRetry(operation, 'test-context')).resolves.toBe(expected);
    expect(mocks.executeD1WithRetry).toHaveBeenCalledWith(operation, 'test-context');
    expect(mocks.executeD1WithRetry).toHaveBeenCalledOnce();
  });

  it('propagates retry exhaustion errors to callers', async () => {
    const dao = new TestDAO(makeDb());
    mocks.executeD1WithRetry.mockRejectedValue(new Error('D1 unavailable'));

    await expect(dao.runWithRetry(vi.fn(), 'failing-context')).rejects.toThrow('D1 unavailable');
  });
});

describe('EncryptedDAO generics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores both the database handle and the master key', () => {
    const db = makeDb();
    const dao = new TestEncryptedDAO(db, 'master-key-1');

    expect(dao.getDatabase()).toBe(db);
    expect(dao.getMasterKey()).toBe('master-key-1');
  });

  it('inherits the shared withRetry behavior', async () => {
    const dao = new TestEncryptedDAO(makeDb(), 'master-key-1');
    const operation = vi.fn().mockResolvedValue({ success: true });
    mocks.executeD1WithRetry.mockResolvedValue({ success: true });

    await dao.runWithRetry(operation, 'encrypted-context');

    expect(mocks.executeD1WithRetry).toHaveBeenCalledWith(operation, 'encrypted-context');
  });
});
