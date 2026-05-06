import { describe, expect, it, vi } from 'vitest';
import { TimestampUtil } from '../../packages/shared/src/utils/TimestampUtil';

describe('TimestampUtil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the current Unix timestamp in milliseconds', () => {
    expect(TimestampUtil.getCurrentUnixTimestampInMilliseconds()).toBe(new Date('2026-01-15T12:00:00Z').getTime());
  });

  it('returns the current Unix timestamp in seconds', () => {
    expect(TimestampUtil.getCurrentUnixTimestampInSeconds()).toBe(Math.floor(new Date('2026-01-15T12:00:00Z').getTime() / 1000));
  });

  it('adds and subtracts minute offsets from second timestamps', () => {
    expect(TimestampUtil.addMinutes(1000, 5)).toBe(1300);
    expect(TimestampUtil.subtractMinutes(1000, 5)).toBe(700);
  });

  it('adds and subtracts day offsets from second timestamps', () => {
    expect(TimestampUtil.addDays(1000, 1)).toBe(87400);
    expect(TimestampUtil.subtractDays(100000, 1)).toBe(13600);
  });

  it('converts ISO timestamps to Unix seconds', () => {
    expect(TimestampUtil.convertIsoToUnixTimestampInSeconds('2026-01-15T12:34:56.789Z')).toBe(1768480496);
  });
});
