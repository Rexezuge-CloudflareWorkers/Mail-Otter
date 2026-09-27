import { describe, expect, it, afterEach, vi } from 'vitest';
import { formatDuration, formatExpiryTimestamp, formatFutureDuration, formatTimestamp } from '@/lib/format';

const NOW_MS = Date.parse('2026-06-15T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW_MS / 1000);

const at = (offsetSeconds: number): number => NOW_SECONDS + offsetSeconds;

afterEach(() => {
  vi.useRealTimers();
});

const freeze = (): void => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_MS));
};

describe('formatDuration', () => {
  it('renders an em dash when a run has not completed', () => {
    expect(formatDuration(at(-60), null)).toBe('—');
  });

  it('renders a zero-length run in milliseconds', () => {
    // Both timestamps come from D1 as whole unix seconds, so the `ms < 1000`
    // branch is only reachable for a same-second run.
    expect(formatDuration(at(-10), at(-10))).toBe('0ms');
  });

  it('renders seconds with one decimal place', () => {
    expect(formatDuration(at(-60), at(-30))).toBe('30.0s');
    expect(formatDuration(at(-60), at(-59))).toBe('1.0s');
    expect(formatDuration(at(-60), at(-1))).toBe('59.0s');
  });

  it('renders minutes and seconds past a minute', () => {
    expect(formatDuration(at(-600), at(-300))).toBe('5m 0s');
    expect(formatDuration(at(-600), at(-65))).toBe('8m 55s');
  });
});

describe('formatTimestamp', () => {
  it('describes a missing timestamp as Never', () => {
    expect(formatTimestamp(null)).toBe('Never');
    expect(formatTimestamp(undefined)).toBe('Never');
  });

  it('describes a sub-minute age as Just now', () => {
    freeze();
    expect(formatTimestamp(at(-30))).toBe('Just now');
  });

  it('describes minutes, hours, and days', () => {
    freeze();
    expect(formatTimestamp(at(-5 * 60))).toBe('5m ago');
    expect(formatTimestamp(at(-59 * 60))).toBe('59m ago');
    expect(formatTimestamp(at(-3 * 3600))).toBe('3h ago');
    expect(formatTimestamp(at(-23 * 3600))).toBe('23h ago');
    expect(formatTimestamp(at(-3 * 86_400))).toBe('3d ago');
  });

  it('falls back to a date past a week', () => {
    freeze();
    const old = at(-10 * 86_400);
    const expected = new Date(old * 1000).toLocaleDateString('en-US');
    expect(formatTimestamp(old)).toBe(expected);
  });
});

describe('formatExpiryTimestamp', () => {
  it('describes a missing expiry as Never', () => {
    expect(formatExpiryTimestamp(null)).toBe('Never');
    expect(formatExpiryTimestamp(undefined)).toBe('Never');
  });

  it('describes an imminent expiry', () => {
    freeze();
    expect(formatExpiryTimestamp(at(30))).toBe('Expires soon');
  });

  it('describes minutes, hours, and days remaining', () => {
    freeze();
    expect(formatExpiryTimestamp(at(5 * 60))).toBe('Expires in 5m');
    expect(formatExpiryTimestamp(at(3 * 3600))).toBe('Expires in 3h');
    expect(formatExpiryTimestamp(at(3 * 86_400))).toBe('Expires in 3d');
  });

  it('switches to an absolute date past thirty days', () => {
    freeze();
    // The absolute-date branch only applies to a *future* expiry at least 30
    // days out; a past timestamp is "Expires soon".
    const later = at(40 * 86_400);
    const expected = `Expires ${new Date(later * 1000).toLocaleDateString('en-US')}`;
    expect(formatExpiryTimestamp(later)).toBe(expected);
  });

  it('treats an already-past expiry as imminent', () => {
    freeze();
    expect(formatExpiryTimestamp(at(-40 * 86_400))).toBe('Expires soon');
  });
});

describe('formatFutureDuration', () => {
  it('describes minutes, hours, and days', () => {
    freeze();
    expect(formatFutureDuration(at(5 * 60))).toBe('5m');
    expect(formatFutureDuration(at(3 * 3600))).toBe('3h');
    expect(formatFutureDuration(at(3 * 86_400))).toBe('3d');
  });

  it('falls back to a date past a week', () => {
    freeze();
    const later = at(10 * 86_400);
    const expected = new Date(later * 1000).toLocaleDateString('en-US');
    expect(formatFutureDuration(later)).toBe(expected);
  });
});
