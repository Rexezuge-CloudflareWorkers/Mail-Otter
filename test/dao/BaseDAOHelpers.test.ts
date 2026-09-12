import { describe, expect, it, vi } from 'vitest';
import { BaseDAO } from '@mail-otter/backend-data/dao';

class TestDAO extends BaseDAO {
  constructor(db: never) {
    super(db as never);
  }

  public find(table: string, column: string, value: string): Promise<{ id: string } | null> {
    return this.findRowById<{ id: string }>(table, column, value);
  }

  public prune(table: string): Promise<number> {
    return this.deleteRowsOlderThan(table, 'created_at', 100, 10, 'id');
  }

  public roundTrip(value: unknown): unknown {
    return this.decodeCursor(this.encodeCursor(value));
  }
}

function makeDb(firstResult: unknown = { id: 'r1' }): never {
  const first = vi.fn().mockResolvedValue(firstResult);
  const run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 3 } });
  return { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first, run })) })) } as never;
}

describe('BaseDAO instance helpers', () => {
  it('findRowById() binds through the DAO database', async () => {
    const db = makeDb();
    const row = await new TestDAO(db).find('widgets', 'id', 'r1');
    expect(row).toEqual({ id: 'r1' });
    expect((db as { prepare: ReturnType<typeof vi.fn> }).prepare).toHaveBeenCalledWith(
      expect.stringContaining('FROM widgets'),
    );
  });

  it('deleteRowsOlderThan() returns affected changes', async () => {
    await expect(new TestDAO(makeDb()).prune('widgets')).resolves.toBe(3);
  });

  it('cursor codec round-trips through the DAO', () => {
    expect(new TestDAO(makeDb()).roundTrip({ a: 1 })).toEqual({ a: 1 });
  });
});
