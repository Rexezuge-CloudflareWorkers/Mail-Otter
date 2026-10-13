import { describe, expect, it, vi } from 'vitest';
import { Container } from '@rexezuge/runtime';
import { FixedClock, NullLogger } from '@mail-otter/shared/utils';
import { createServiceContext } from '@mail-otter/backend-runtime/di';

/**
 * The kit's `Container` is factory + singleton scopes and nothing else, so the
 * two cases the old copy carried are gone with it:
 *
 * - `resolve()` (non-memoizing resolve) had no production caller in this repo.
 *   `Provider<T>` in the family is a lazy thunk (`() => Promise<T>`) bound as a
 *   singleton, which `get()` already memoizes, so the escape hatch bought
 *   nothing here and cost a second way to read a binding.
 * - `createChild()` likewise had no production caller. A child scope is built
 *   explicitly by the composition root.
 *
 * Both behaviours belong to the kit now, so they are not re-tested here; a
 * re-implementation would be a second container drifting from the first.
 */
describe('Container', () => {
  it('memoizes a factory binding', () => {
    const container = new Container();
    container.bind('svc', () => ({ created: Math.random() }));

    const first = container.get<object>('svc');
    expect(container.get<object>('svc')).toBe(first);
  });

  it('bindValue() returns the exact value', () => {
    const container = new Container();
    const value = { answer: 42 };
    container.bindValue('answer', value);
    expect(container.get('answer')).toBe(value);
  });

  it('reports whether a token is bound', () => {
    const container = new Container();
    container.bindValue('a', 1);
    expect(container.has('a')).toBe(true);
    expect(container.has('b')).toBe(false);
  });

  it('throws for unbound tokens', () => {
    expect(() => new Container().get('missing')).toThrow('no binding');
  });

  it('resolves dependency graphs through the container', () => {
    const container = new Container();
    container.bindValue('base', 2);
    container.bind('double', (c) => c.get<number>('base') * 2);
    expect(container.get('double')).toBe(4);
  });
});

describe('createServiceContext', () => {
  const env = { DB: {}, AI: {} } as never;

  it('provides default logger and clock', () => {
    const ctx = createServiceContext(env);
    expect(ctx.env).toBe(env);
    expect(typeof ctx.logger.warn).toBe('function');
    // `Clock.now()`, not the old local `IClock.nowMs()` — the kit renamed the
    // method along with the interface.
    expect(typeof ctx.clock.now).toBe('function');
  });

  it('honors overrides', () => {
    const logger = new NullLogger();
    const clock = new FixedClock(123);
    const ctx = createServiceContext(env, { logger, clock });
    expect(ctx.logger).toBe(logger);
    expect(ctx.clock).toBe(clock);
    vi.spyOn(logger, 'warn');
    ctx.logger.warn('quiet');
    expect(logger.warn).toHaveBeenCalled();
  });
});
