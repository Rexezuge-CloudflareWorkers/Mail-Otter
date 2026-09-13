import {
  DIGEST_APPOINTMENTS_HOURS,
  DIGEST_BILLS_DUE_DAYS,
} from '@mail-otter/shared/constants';
import type { AppointmentConfirmActionPayload, FinancePayBillActionPayload } from '@mail-otter/shared/model';
import type { EmailAction } from '@mail-otter/shared/model';

/**
 * Pure helpers for digest section filtering + day boundaries.
 *
 * Extracted from `DigestService.buildSections` so date math is unit-testable
 * without D1. All methods are pure (no DAO/env access).
 */
class DigestSectionBuilder {
  public static getDayStartUnix(now: Date, timeZone: string): number {
    const localParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: string): string => localParts.find((p) => p.type === type)?.value ?? '00';
    const dateStr = `${get('year')}-${get('month')}-${get('day')}T00:00:00`;
    return Math.floor(new Date(dateStr).getTime() / 1000);
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
