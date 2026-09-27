import { DIGEST_APPOINTMENTS_HOURS, DIGEST_BILLS_DUE_DAYS } from '@mail-otter/shared/constants';
import { TimeZoneUtil } from '@mail-otter/shared/utils';
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
   * Delegates to `TimeZoneUtil` so the digest day boundary and the calendar
   * sync window (`CalendarSyncWindow`) cannot drift apart — they must describe
   * the same local day for the digest's calendar section to be covered.
   */
  public static getDayStartUnix(now: Date, timeZone: string): number {
    return TimeZoneUtil.getLocalDayStartUnixSeconds(now, timeZone);
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
