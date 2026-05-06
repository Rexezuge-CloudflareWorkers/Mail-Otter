import { describe, expect, it, vi } from 'vitest';
import { formatTimestamp } from '../../apps/web/components/utils';

describe('formatTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-11-14T22:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats numeric timestamps as Unix seconds, not milliseconds', () => {
    expect(formatTimestamp(1700000000)).toBe('16m ago');
  });

  it('returns Never for missing timestamps', () => {
    expect(formatTimestamp(null)).toBe('Never');
    expect(formatTimestamp(undefined)).toBe('Never');
  });
});
