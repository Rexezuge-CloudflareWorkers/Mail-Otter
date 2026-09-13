import { describe, expect, it } from 'vitest';
import { DigestSectionBuilder } from '@mail-otter/backend-services/digest';

function action(id: string, payload: unknown) {
  return { actionId: id, payload } as never;
}

describe('DigestSectionBuilder', () => {
  it('computes day-start unix in UTC', () => {
    const now = new Date('2026-03-10T15:30:00Z');
    const start = DigestSectionBuilder.getDayStartUnix(now, 'UTC');
    expect(start).toBe(Math.floor(new Date('2026-03-10T00:00:00').getTime() / 1000));
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
