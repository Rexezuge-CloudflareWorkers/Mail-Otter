import { describe, expect, it } from 'vitest';
import { checkpointPlace, latestCheckpoint } from '@mail-otter/provider-clients';

interface Checkpoint {
  city?: string;
  state?: string;
  message?: string;
}

/**
 * Aftership returns `checkings[].checkpoints` newest-first.
 *
 * `ActionStatusSyncUtil` read `checkpoints[0]` as the latest scan while
 * `PackageTrackingService.buildSummary` read `checkpoints.at(-1)`, which is the
 * *oldest*. A package scanned five times showed its current location in the
 * digest and its first-ever location on the action card. Single-checkpoint
 * fixtures made the divergence invisible.
 */
describe('Aftership checkpoint interpretation', () => {
  const newestFirst: Checkpoint[] = [
    { city: 'Louisville', state: 'KY', message: 'Out For Delivery' },
    { city: 'Indianapolis', state: 'IN', message: 'Arrived at facility' },
    { city: 'Chicago', state: 'IL', message: 'Package received' },
  ];

  it('treats the first checkpoint as the most recent scan', () => {
    expect(latestCheckpoint(newestFirst)?.message).toBe('Out For Delivery');
  });

  it('does not report the oldest scan as current', () => {
    // The old `.at(-1)` behavior returned 'Package received'.
    expect(latestCheckpoint(newestFirst)?.message).not.toBe('Package received');
  });

  it('formats a place from city and state', () => {
    expect(checkpointPlace(latestCheckpoint(newestFirst))).toBe('Louisville, KY');
  });

  it('handles a single checkpoint', () => {
    const single: Checkpoint[] = [{ city: 'Austin', state: 'TX', message: 'Delivered' }];
    expect(latestCheckpoint(single)?.message).toBe('Delivered');
    expect(checkpointPlace(latestCheckpoint(single))).toBe('Austin, TX');
  });

  it('returns undefined for an empty or missing list', () => {
    expect(latestCheckpoint([])).toBeUndefined();
    expect(latestCheckpoint(undefined)).toBeUndefined();
    expect(checkpointPlace(undefined)).toBeUndefined();
  });

  it('omits the separator when only one of city or state is present', () => {
    expect(checkpointPlace({ city: 'Denver' })).toBe('Denver');
    expect(checkpointPlace({ state: 'CO' })).toBe('CO');
    expect(checkpointPlace({ message: 'in transit' })).toBeUndefined();
  });
});
