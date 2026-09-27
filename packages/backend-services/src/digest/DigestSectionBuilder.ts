import { DIGEST_APPOINTMENTS_HOURS, DIGEST_BILLS_DUE_DAYS } from '@mail-otter/shared/constants';
import type { AppointmentConfirmActionPayload, FinancePayBillActionPayload } from '@mail-otter/shared/model';
import type { EmailAction } from '@mail-otter/shared/model';

/**
 * Pure helpers for digest section filtering + day boundaries.
 *
 * Extracted from `DigestService.buildSections` so date math is unit-testable
 * without D1. All methods are pure (no DAO/env access).
 */
class DigestSectionBuilder {
  /**
   * Unix seconds of local midnight for the calendar day containing `now`,
   * as observed in `timeZone`.
   *
   * The previous implementation formatted the zone's calendar date and then
   * built `new Date('YYYY-MM-DDT00:00:00')`. A date-time string with no zone
   * designator is parsed in the *runtime's* zone, which for Workers is always
   * UTC, so `timeZone` was effectively ignored and every non-UTC mailbox got a
   * day window shifted by its UTC offset. A user in `America/New_York` asking
   * for 2026-03-10 got `[2026-03-10T00:00Z, 2026-03-11T00:00Z)` instead of
   * `[2026-03-10T04:00Z, 2026-03-11T04:00Z)`, pulling in the previous
   * evening's events and dropping the current evening's.
   *
   * Two passes are needed because the offset depends on the instant: read the
   * wall clock in the target zone, treat it as UTC to derive the offset, then
   * re-anchor local midnight with that offset. The offset is taken from `now`
   * rather than from the target midnight, which is exact except within a few
   * hours of a DST transition — irrelevant for a 24-hour digest window.
   */
  public static getDayStartUnix(now: Date, timeZone: string): number {
    let wallClock: Intl.DateTimeFormatPart[];
    try {
      wallClock = this.formatInZone(now, timeZone || 'UTC');
    } catch {
      // Unknown IANA zone (a stale user preference): fall back to UTC rather
      // than throwing and losing the whole digest.
      wallClock = this.formatInZone(now, 'UTC');
    }

    const year: number = Number(this.part(wallClock, 'year'));
    const month: number = Number(this.part(wallClock, 'month'));
    const day: number = Number(this.part(wallClock, 'day'));
    // Some ICU builds report midnight as hour 24 under `hour12: false`.
    const hour: number = Number(this.part(wallClock, 'hour')) % 24;
    const minute: number = Number(this.part(wallClock, 'minute'));
    const second: number = Number(this.part(wallClock, 'second'));

    const wallClockAsUtcMs: number = Date.UTC(year, month - 1, day, hour, minute, second);
    const zoneOffsetMs: number = wallClockAsUtcMs - now.getTime();
    const localMidnightAsUtcMs: number = Date.UTC(year, month - 1, day, 0, 0, 0);
    return Math.floor((localMidnightAsUtcMs - zoneOffsetMs) / 1000);
  }

  private static formatInZone(now: Date, timeZone: string): Intl.DateTimeFormatPart[] {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(now);
  }

  private static part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
    return parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === type)?.value ?? '0';
  }

  public static getBillsDueByUnix(nowUnix: number): number {
    return nowUnix + DIGEST_BILLS_DUE_DAYS * 86_400;
  }

  public static getAppointmentsByUnix(nowUnix: number): number {
    return nowUnix + DIGEST_APPOINTMENTS_HOURS * 3600;
  }

  public static filterBillsDue(allBills: EmailAction[], nowUnix: number): EmailAction[] {
    const billsDueByUnix = this.getBillsDueByUnix(nowUnix);
    return allBills.filter((a) => {
      const dueDate = (a.payload as FinancePayBillActionPayload).dueDate;
      if (!dueDate) return true;
      const dueDateUnix = Math.floor(new Date(dueDate).getTime() / 1000);
      return !Number.isNaN(dueDateUnix) && dueDateUnix <= billsDueByUnix;
    });
  }

  public static filterUpcomingAppointments(allAppointments: EmailAction[], nowUnix: number): EmailAction[] {
    const appointmentsByUnix = this.getAppointmentsByUnix(nowUnix);
    return allAppointments.filter((a) => {
      const apptTime = (a.payload as AppointmentConfirmActionPayload).appointmentTime;
      if (!apptTime) return true;
      const apptUnix = Math.floor(new Date(apptTime).getTime() / 1000);
      return !Number.isNaN(apptUnix) && apptUnix <= appointmentsByUnix;
    });
  }
}

export { DigestSectionBuilder };
