import { describe, expect, it } from 'vitest';
import { CalendarSyncWindow, TimeZoneUtil } from '@mail-otter/shared/utils';
import { DigestSectionBuilder } from '@mail-otter/backend-services/digest';
import { DIGEST_CALENDAR_SYNC_DAYS } from '@mail-otter/shared/constants';

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * The calendar sync window and the digest's day section must describe the same
 * local day, or the digest renders a section the sync never fetched.
 *
 * Two defects motivated this. `CalendarEventSyncTask` used
 * `DIGEST_CALENDAR_SYNC_DAYS` while the manual `ProcessingService.triggerTask`
 * path hardcoded `48 * 3600 * 1000`, so a manual trigger only ever upserted two
 * days. And both started the window at `now` while the digest's calendar
 * section covers `[local midnight, +24h)`, so the hours between local midnight
 * and the first sync of the day were never queried — a morning event on a newly
 * connected mailbox was missing from that day's digest.
 */
describe('CalendarSyncWindow', () => {
  const now = new Date('2026-03-10T15:30:00Z'); // 11:30 in New York, 00:30 next day in Sydney

  it('anchors the window to local midnight in the mailbox time zone', () => {
    const { startIso } = CalendarSyncWindow.build(now, 'America/New_York');
    // US DST began 2026-03-08, so this date is EDT (UTC-4): local midnight is
    // 04:00Z. A hardcoded UTC midnight here would be 04:00 hours early and would
    // miss the previous evening, and 20:00 hours late for the current one.
    expect(startIso).toBe('2026-03-10T04:00:00.000Z');
  });

  it('uses standard time on the far side of a DST transition', () => {
    const winter = new Date('2026-01-10T15:30:00Z'); // EST, UTC-5
    const { startIso } = CalendarSyncWindow.build(winter, 'America/New_York');
    expect(startIso).toBe('2026-01-10T05:00:00.000Z');
  });

  it('spans the full digest horizon', () => {
    const { startIso, endIso } = CalendarSyncWindow.build(now, 'UTC');
    const span = new Date(endIso).getTime() - new Date(startIso).getTime();
    expect(span).toBe(DIGEST_CALENDAR_SYNC_DAYS * MILLISECONDS_PER_DAY);
  });

  it('starts at or before now, never after', () => {
    // The whole point of anchoring to local midnight: an event earlier today
    // must be inside the window.
    for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland']) {
      const { startIso } = CalendarSyncWindow.build(now, zone);
      expect(new Date(startIso).getTime(), `zone ${zone}`).toBeLessThanOrEqual(now.getTime());
    }
  });

  it('falls back to UTC for an unknown or missing zone', () => {
    const fromUnknown = CalendarSyncWindow.build(now, 'Not/AZone');
    const fromNull = CalendarSyncWindow.build(now, null);
    const fromUtc = CalendarSyncWindow.build(now, 'UTC');
    expect(fromUnknown).toEqual(fromUtc);
    expect(fromNull).toEqual(fromUtc);
  });

  it('agrees with the digest day boundary it feeds', () => {
    // If these two drift, the digest's calendar section silently loses events.
    for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Europe/Berlin', 'Australia/Sydney']) {
      const { startIso } = CalendarSyncWindow.build(now, zone);
      const digestStart = DigestSectionBuilder.getDayStartUnix(now, zone);
      expect(new Date(startIso).getTime() / 1000, `zone ${zone}`).toBe(digestStart);
    }
  });

  it('shares one implementation with TimeZoneUtil', () => {
    const { startIso } = CalendarSyncWindow.build(now, 'America/New_York');
    expect(new Date(startIso).getTime() / 1000).toBe(TimeZoneUtil.getLocalDayStartUnixSeconds(now, 'America/New_York'));
  });
});
