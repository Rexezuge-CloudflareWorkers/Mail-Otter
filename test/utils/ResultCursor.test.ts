import { describe, expect, it } from 'vitest';
import { Cursor, err, getOrThrow, isOk, mapResult, ok } from '@mail-otter/shared/utils';

describe('Result', () => {
  it('ok() creates a success result', () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(getOrThrow(result as { ok: true; value: number })).toBe(42);
  });

  it('err() creates a failure result', () => {
    const failure = new Error('boom');
    const result = err(failure);
    expect(isOk(result)).toBe(false);
    expect(() => getOrThrow(result as { ok: true; value: never })).toThrow('boom');
  });

  it('mapResult() transforms successes and passes failures through', () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
    const failure = err(new Error('nope'));
    expect(mapResult(failure, (n: never) => n)).toBe(failure);
  });
});

describe('Cursor', () => {
  it('round-trips opaque cursor payloads', () => {
    const cursor = Cursor.encode({ updatedAt: 100, createdAt: 200 });
    expect(typeof cursor).toBe('string');
    expect(Cursor.decode<{ updatedAt: number; createdAt: number }>(cursor)).toEqual({ updatedAt: 100, createdAt: 200 });
  });

  it('returns undefined for missing or corrupt cursors', () => {
    expect(Cursor.decode(undefined)).toBeUndefined();
    expect(Cursor.decode('!!!not-base64!!!')).toBeUndefined();
  });

  it('page() omits nextCursor when exhausted', () => {
    expect(Cursor.page([1, 2])).toEqual({ items: [1, 2] });
    expect(Cursor.page([1], 'abc')).toEqual({ items: [1], nextCursor: 'abc' });
  });
});
