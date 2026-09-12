import { describe, expect, it, vi } from 'vitest';
import { Container } from '@mail-otter/backend-runtime/di';
import { createServiceContext } from '@mail-otter/backend-runtime/di';
import { NullLogger } from '@mail-otter/shared/utils';
import { FixedClock } from '@mail-otter/shared/utils';

describe('Container', () => {
  it('resolves bound factories as singletons via get()', () => {
    const container = new Container();
    let calls = 0;
    container.bind('svc', () => {
      calls += 1;
      return { id: calls };
    });

    expect(container.get<{ id: number }>('svc')).toBe(container.get<{ id: number }>('svc'));
    expect(calls).toBe(1);
  });

  it('resolve() creates a fresh instance without memoizing', () => {
    const container = new Container();
    container.bind('svc', () => ({ created: Math.random() }));

    const first = container.resolve<object>('svc');
    expect(container.resolve<object>('svc')).not.toBe(first);
    expect(container.has('svc')).toBe(true);
  });

  it('bindValue() returns the exact value', () => {
    const container = new Container();
    const value = { answer: 42 };
    container.bindValue('answer', value);
    expect(container.get('answer')).toBe(value);
  });

  it('throws for unbound tokens', () => {
    expect(() => new Container().get('missing')).toThrow('no binding');
  });

  it('resolves dependency graphs through the container', () => {
    const container = new Container();
    container.bindValue('base', 2);
    container.bind('double', (c) => (c.get<number>('base') as number) * 2);
    expect(container.get('double')).toBe(4);
  });

  it('createChild() inherits parent bindings', () => {
    const parent = new Container();
    parent.bindValue('a', 1);
    const child = parent.createChild();
    child.bindValue('b', 2);
    expect(child.get('a')).toBe(1);
    expect(child.get('b')).toBe(2);
    expect(parent.has('b')).toBe(false);
  });
});

describe('createServiceContext', () => {
  const env = { DB: {}, AI: {} } as never;

  it('provides default logger and clock', () => {
    const ctx = createServiceContext(env);
    expect(ctx.env).toBe(env);
    expect(typeof ctx.logger.warn).toBe('function');
    expect(typeof ctx.clock.nowMs).toBe('function');
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
