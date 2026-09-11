import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CryptoIdGenerator, FixedIdGenerator } from '@mail-otter/shared/utils';

describe('CryptoIdGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates RFC 4122 UUIDs', () => {
    const id = new CryptoIdGenerator().randomUUID();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique values', () => {
    const generator = new CryptoIdGenerator();
    expect(generator.randomUUID()).not.toBe(generator.randomUUID());
  });
});

describe('FixedIdGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replays a single queued id', () => {
    expect(new FixedIdGenerator('id-1').randomUUID()).toBe('id-1');
  });

  it('replays queued ids in order', () => {
    const generator = new FixedIdGenerator(['id-1', 'id-2']);
    expect(generator.randomUUID()).toBe('id-1');
    expect(generator.randomUUID()).toBe('id-2');
  });

  it('accepts additional ids via queueId', () => {
    const generator = new FixedIdGenerator();
    generator.queueId('late-id');
    expect(generator.randomUUID()).toBe('late-id');
  });

  it('falls back to deterministic fixed-uuid counters when the queue is empty', () => {
    const generator = new FixedIdGenerator();
    expect(generator.randomUUID()).toBe('fixed-uuid-1');
    expect(generator.randomUUID()).toBe('fixed-uuid-2');
  });

  it('ignores empty-string seeds', () => {
    expect(new FixedIdGenerator('').randomUUID()).toBe('fixed-uuid-1');
  });
});
