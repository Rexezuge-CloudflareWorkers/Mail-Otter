import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedClock, SystemClock } from '@mail-otter/shared/utils';

describe('SystemClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the current wall-clock time in milliseconds', () => {
    expect(new SystemClock().nowMs()).toBe(new Date('2026-09-11T00:00:00Z').getTime());
  });

  it('advances with the wall clock', () => {
    const clock = new SystemClock();
    const before = clock.nowMs();
    vi.advanceTimersByTime(5_000);
    expect(clock.nowMs()).toBe(before + 5_000);
  });
});

describe('FixedClock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to the epoch when no initial time is given', () => {
    expect(new FixedClock().nowMs()).toBe(0);
  });

  it('returns the configured initial time', () => {
    expect(new FixedClock(1_778_200_000_000).nowMs()).toBe(1_778_200_000_000);
  });

  it('updates the current time via setNowMs', () => {
    const clock = new FixedClock(1000);
    clock.setNowMs(2000);
    expect(clock.nowMs()).toBe(2000);
  });

  it('advances the current time via advanceByMs', () => {
    const clock = new FixedClock(1000);
    clock.advanceByMs(60_000);
    expect(clock.nowMs()).toBe(61_000);
  });

  it('supports negative deltas', () => {
    const clock = new FixedClock(61_000);
    clock.advanceByMs(-60_000);
    expect(clock.nowMs()).toBe(1000);
  });
});
