import { describe, expect, it, vi } from 'vitest';
import { CursorCodec } from '@rexezuge/shared';
import { deleteOlderThan, findRowById } from '@mail-otter/backend-data/dao';

/**
 * These are standalone helpers now rather than instance methods on `BaseDAO`.
 *
 * They used to be three things at once: an instance method, a static on
 * `BaseDAO`, *and* the thing every DAO inherited — so `findById` existed in four
 * shapes. The kit's `BaseDAO` is sql-first and carries none of them, and the
 * `findById` static is specifically what the kit declined to ship (a business DAO
 * with its own `findById` silently shadowed it). What is left is one function
 * each, which is what these test.
 *
 * Cursor encoding is not tested here at all: it is `@rexezuge/shared`'s
 * `CursorCodec` now, and that package owns its tests.
 */

const DEFAULT_ROW: { id: string } = { id: 'r1' };

function makeDb(firstResult: unknown = DEFAULT_ROW): never {
  const first = vi.fn().mockResolvedValue(firstResult);
  const run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 3 } });
  return { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first, run })) })) } as never;
}

describe('findRowById', () => {
  it('binds the id and returns the row', async () => {
    const db = makeDb();
    await expect(findRowById<{ id: string }>(db, 'widgets', 'id', 'r1')).resolves.toEqual({ id: 'r1' });
    expect((db as { prepare: ReturnType<typeof vi.fn> }).prepare).toHaveBeenCalledWith(expect.stringContaining('FROM widgets'));
  });

  it('returns null when there is no row', async () => {
    await expect(findRowById(makeDb(null), 'widgets', 'id', 'r1')).resolves.toBeNull();
  });

  it('restricts a column list to identifiers', async () => {
    const db = makeDb();
    await findRowById(db, 'widgets', 'id', 'r1', 'id, name');
    expect((db as { prepare: ReturnType<typeof vi.fn> }).prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT id, name FROM'));
  });

  it('rejects an identifier that is not an identifier', async () => {
    // The table and column names are the only values ever interpolated into SQL;
    // every actual value travels as a binding. This is what makes that safe.
    // `rejects`, not `toThrow`: the guard runs inside an `async` function, so it
    // surfaces as a rejection rather than a synchronous throw.
    await expect(findRowById(makeDb(), 'widgets; DROP TABLE users', 'id', 'r1')).rejects.toThrow(/Invalid SQL identifier/);
    await expect(findRowById(makeDb(), 'widgets', 'id, (SELECT 1)', 'r1')).rejects.toThrow(/Invalid SQL identifier/);
  });
});

describe('deleteOlderThan', () => {
  it('returns the affected row count', async () => {
    await expect(deleteOlderThan(makeDb(), 'widgets', 'created_at', 100, 10, 'id')).resolves.toBe(3);
  });

  it('bounds the delete with a limited subquery', async () => {
    const db = makeDb();
    await deleteOlderThan(db, 'widgets', 'created_at', 100, 10, 'id');
    // D1 has no DELETE … LIMIT, so the bounded form is what keeps a retention
    // prune from trying to remove every matching row in one statement.
    expect((db as { prepare: ReturnType<typeof vi.fn> }).prepare).toHaveBeenCalledWith(expect.stringContaining('LIMIT ?'));
  });
});

describe('CursorCodec (in use by the DAOs)', () => {
  it('round-trips a payload', () => {
    expect(CursorCodec.decode<{ a: number }>(CursorCodec.encode({ a: 1 }))).toEqual({ a: 1 });
  });

  it('answers undefined rather than throwing on a malformed cursor', () => {
    // A truncated or tampered cursor is absence, not an error: a client that
    // hands back garbage gets the first page rather than a 500.
    expect(CursorCodec.decode('!!!not-base64!!!')).toBeUndefined();
  });
});
