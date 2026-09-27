import { describe, expect, it } from 'vitest';
import { DigestSectionBuilder } from '@mail-otter/backend-services/digest';

function action(id: string, payload: unknown) {
  return { actionId: id, payload } as never;
}

describe('DigestSectionBuilder', () => {
  describe('getDayStartUnix', () => {
    const toIso = (unix: number): string => new Date(unix * 1000).toISOString();

    it('computes day-start unix in UTC', () => {
      const now = new Date('2026-03-10T15:30:00Z');
      const start = DigestSectionBuilder.getDayStartUnix(now, 'UTC');
      expect(start).toBe(Math.floor(new Date('2026-03-10T00:00:00Z').getTime() / 1000));
    });

    // Regression: the implementation used to format the zone's calendar date and
    // then build `new Date('YYYY-MM-DDT00:00:00')`. With no zone designator that
    // parses in the runtime's zone, and the Workers runtime is always UTC — so
    // `timeZone` was ignored and every non-UTC mailbox got a day window shifted
    // by its UTC offset.
    it.each([
      ['America/New_York', '2026-03-10T15:30:00Z', '2026-03-10T04:00:00.000Z'],
      ['Asia/Tokyo', '2026-01-15T03:00:00Z', '2026-01-14T15:00:00.000Z'],
      ['Europe/Berlin', '2026-07-04T12:00:00Z', '2026-07-03T22:00:00.000Z'],
      ['America/Los_Angeles', '2026-07-04T20:00:00Z', '2026-07-04T07:00:00.000Z'],
      ['Asia/Kolkata', '2026-06-01T18:30:00Z', '2026-06-01T18:30:00.000Z'],
    ])('uses the mailbox time zone (%s)', (timeZone: string, nowIso: string, expectedIso: string) => {
      expect(toIso(DigestSectionBuilder.getDayStartUnix(new Date(nowIso), timeZone))).toBe(expectedIso);
    });

    it('handles a local date that differs from the UTC date', () => {
      // 00:30Z on 1 June is 10:30 on 1 June in Sydney, so local midnight is
      // 14:00Z on 31 May — the UTC calendar day is not the local one.
      expect(toIso(DigestSectionBuilder.getDayStartUnix(new Date('2026-06-01T00:30:00Z'), 'Australia/Sydney'))).toBe(
        '2026-05-31T14:00:00.000Z',
      );
    });

    it('handles a half-hour offset zone', () => {
      expect(toIso(DigestSectionBuilder.getDayStartUnix(new Date('2026-06-01T18:30:00Z'), 'Asia/Kolkata'))).toBe(
        '2026-06-01T18:30:00.000Z',
      );
    });

    it('resolves correctly on both sides of a DST transition', () => {
      // US DST began 2026-03-08 and ends 2026-11-01.
      expect(toIso(DigestSectionBuilder.getDayStartUnix(new Date('2026-03-10T15:30:00Z'), 'America/New_York'))).toBe(
        '2026-03-10T04:00:00.000Z',
      );
      expect(toIso(DigestSectionBuilder.getDayStartUnix(new Date('2026-11-01T05:30:00Z'), 'America/New_York'))).toBe(
        '2026-11-01T04:00:00.000Z',
      );
    });

    it('always returns the start of a 24-hour window, never the current time', () => {
      for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland', 'Europe/Berlin']) {
        for (const nowIso of ['2026-01-01T00:00:00Z', '2026-06-15T13:37:41Z', '2026-12-31T23:59:59Z']) {
          const start = DigestSectionBuilder.getDayStartUnix(new Date(nowIso), zone);
          // Midnight local must land on a whole multiple of 60, and the next
          // day's midnight exactly 86400s later.
          expect(start % 60).toBe(0);
          const nextDay = DigestSectionBuilder.getDayStartUnix(new Date(start * 1000 + 86_400_000), zone);
          expect(nextDay - start).toBe(86_400);
        }
      }
    });

    it('falls back to UTC for an unknown zone instead of throwing', () => {
      const now = new Date('2026-03-10T15:30:00Z');
      expect(DigestSectionBuilder.getDayStartUnix(now, 'Not/AZone')).toBe(DigestSectionBuilder.getDayStartUnix(now, 'UTC'));
    });

    it('treats an empty zone as UTC', () => {
      const now = new Date('2026-03-10T15:30:00Z');
      expect(DigestSectionBuilder.getDayStartUnix(now, '')).toBe(DigestSectionBuilder.getDayStartUnix(now, 'UTC'));
    });
  });

  it('keeps bills without due dates and drops far-future bills', () => {
    const nowUnix = Math.floor(new Date('2026-03-10T12:00:00Z').getTime() / 1000);
    const bills = [
      action('a', {}),
      action('b', { dueDate: '2026-03-01T00:00:00Z' }),
      action('c', { dueDate: '2026-12-01T00:00:00Z' }),
      action('d', { dueDate: 'not-a-date' }),
    ];
    const filtered = DigestSectionBuilder.filterBillsDue(bills, nowUnix);
    expect(filtered.map((a) => (a as { actionId: string }).actionId).sort()).toEqual(['a', 'b']);
  });

  it('keeps appointments without times and drops far-future appointments', () => {
    const nowUnix = Math.floor(new Date('2026-03-10T12:00:00Z').getTime() / 1000);
    const appts = [
      action('a', {}),
      action('b', { appointmentTime: '2026-03-10T13:00:00Z' }),
      action('c', { appointmentTime: '2026-04-10T13:00:00Z' }),
    ];
    const filtered = DigestSectionBuilder.filterUpcomingAppointments(appts, nowUnix);
    expect(filtered.map((a) => (a as { actionId: string }).actionId).sort()).toEqual(['a', 'b']);
  });
});
