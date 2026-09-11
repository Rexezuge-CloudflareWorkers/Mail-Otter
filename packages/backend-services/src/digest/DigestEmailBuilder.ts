import { EmailContentUtil } from '@mail-otter/provider-clients/email-content';
import {
  DIGEST_SECTION_APPOINTMENTS,
  DIGEST_SECTION_BILLS,
  DIGEST_SECTION_CALENDAR,
  DIGEST_SECTION_FLIGHTS,
  DIGEST_SECTION_PACKAGES,
  DIGEST_SECTION_TASKS,
} from '@mail-otter/shared/constants';
import { formatBackendString, getBackendStrings } from '@mail-otter/shared/i18n';
import { LocaleUtil } from '@mail-otter/shared/utils';
import type {
  AppointmentConfirmActionPayload,
  DeliveryTrackPackageActionPayload,
  EmailAction,
  FinancePayBillActionPayload,
  ManualTodoActionPayload,
  SyncedCalendarEvent,
  TravelTrackFlightActionPayload,
} from '@mail-otter/shared/model';
import type { PackageSyncStatus, FlightSyncStatus } from './ActionStatusSyncUtil';

interface DigestSections {
  calendarEvents: SyncedCalendarEvent[];
  tasks: EmailAction[];
  packages: EmailAction[];
  flights: EmailAction[];
  bills: EmailAction[];
  appointments: EmailAction[];
}

class DigestEmailBuilder {
  public static buildSubject(date: Date, timeZone: string, locale?: string | null): string {
    const strings = getBackendStrings(locale);
    const tag = LocaleUtil.normalize(locale);
    const localDate = new Intl.DateTimeFormat(tag, {
      timeZone: timeZone || 'UTC',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
    return `${strings.digest.subjectPrefix} — ${localDate}`;
  }

  public static buildHtml(sections: DigestSections, enabledSections: string[], locale?: string | null): string {
    const strings = getBackendStrings(locale);
    const parts: string[] = [
      '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a">',
      `<h1 style="font-size:20px;font-weight:700;margin:0 0 4px">${strings.digest.title}</h1>`,
      `<p style="font-size:13px;color:#666;margin:0 0 24px">${strings.digest.subtitle}</p>`,
    ];

    let hasContent = false;

    if (enabledSections.includes(DIGEST_SECTION_CALENDAR) && sections.calendarEvents.length > 0) {
      parts.push(this.buildCalendarSection(sections.calendarEvents, locale));
      hasContent = true;
    }
    if (enabledSections.includes(DIGEST_SECTION_TASKS) && sections.tasks.length > 0) {
      parts.push(this.buildTasksSection(sections.tasks, locale));
      hasContent = true;
    }
    if (enabledSections.includes(DIGEST_SECTION_PACKAGES) && sections.packages.length > 0) {
      parts.push(this.buildPackagesSection(sections.packages, locale));
      hasContent = true;
    }
    if (enabledSections.includes(DIGEST_SECTION_FLIGHTS) && sections.flights.length > 0) {
      parts.push(this.buildFlightsSection(sections.flights, locale));
      hasContent = true;
    }
    if (enabledSections.includes(DIGEST_SECTION_BILLS) && sections.bills.length > 0) {
      parts.push(this.buildBillsSection(sections.bills, locale));
      hasContent = true;
    }
    if (enabledSections.includes(DIGEST_SECTION_APPOINTMENTS) && sections.appointments.length > 0) {
      parts.push(this.buildAppointmentsSection(sections.appointments, locale));
      hasContent = true;
    }

    if (!hasContent) {
      parts.push(`<p style="color:#666;font-size:14px">${strings.digest.empty}</p>`);
    }

    parts.push(
      '<p style="font-size:11px;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:12px">',
      strings.digest.footer,
      '</p>',
      '</div>',
    );

    return parts.join('\n');
  }

  public static hasContent(sections: DigestSections, enabledSections: string[]): boolean {
    return (
      (enabledSections.includes(DIGEST_SECTION_CALENDAR) && sections.calendarEvents.length > 0) ||
      (enabledSections.includes(DIGEST_SECTION_TASKS) && sections.tasks.length > 0) ||
      (enabledSections.includes(DIGEST_SECTION_PACKAGES) && sections.packages.length > 0) ||
      (enabledSections.includes(DIGEST_SECTION_FLIGHTS) && sections.flights.length > 0) ||
      (enabledSections.includes(DIGEST_SECTION_BILLS) && sections.bills.length > 0) ||
      (enabledSections.includes(DIGEST_SECTION_APPOINTMENTS) && sections.appointments.length > 0)
    );
  }

  private static buildCalendarSection(events: SyncedCalendarEvent[], locale?: string | null): string {
    const strings = getBackendStrings(locale);
    const tag = LocaleUtil.normalize(locale);
    const rows = events.map((ev) => {
      const start = new Date(ev.startTime * 1000).toLocaleTimeString(tag, { timeZone: ev.timeZone, hour: '2-digit', minute: '2-digit' });
      const end = new Date(ev.endTime * 1000).toLocaleTimeString(tag, { timeZone: ev.timeZone, hour: '2-digit', minute: '2-digit' });
      const location = ev.location ? `<span style="color:#666"> · ${EmailContentUtil.sanitizeHtml(ev.location)}</span>` : '';
      return `<li style="margin-bottom:8px"><strong>${EmailContentUtil.sanitizeHtml(ev.eventTitle)}</strong> <span style="color:#666">${start}–${end}</span>${location}</li>`;
    });
    return this.buildSection(strings.digest.calendarHeading, rows.join(''));
  }

  private static buildTasksSection(actions: EmailAction[], locale?: string | null): string {
    const strings = getBackendStrings(locale);
    const rows = actions.map((a) => {
      const payload = a.payload as ManualTodoActionPayload;
      return `<li style="margin-bottom:8px"><strong>${EmailContentUtil.sanitizeHtml(a.title)}</strong><br><span style="color:#666;font-size:13px">${EmailContentUtil.sanitizeHtml(payload.instructions || a.description)}</span></li>`;
    });
    return this.buildSection(strings.digest.tasksHeading, rows.join(''));
  }

  private static buildPackagesSection(actions: EmailAction[], locale?: string | null): string {
    const strings = getBackendStrings(locale);
    const rows = actions.map((a) => {
      const payload = a.payload as DeliveryTrackPackageActionPayload;
      let syncStatus: PackageSyncStatus | null = null;
      try {
        if (a.syncStatus) {
          syncStatus = JSON.parse(a.syncStatus) as PackageSyncStatus;
        }
      } catch {
        /*
        ignore parse errors
        */
      }
      const statusLabel = syncStatus?.statusLabel ?? syncStatus?.status;
      const status = statusLabel ? ` — ${EmailContentUtil.sanitizeHtml(statusLabel)}` : '';
      const location = syncStatus?.location ? ` · ${EmailContentUtil.sanitizeHtml(syncStatus.location)}` : '';
      const eta = syncStatus?.expectedDelivery
        ? `<br><span style="color:#666;font-size:13px">${EmailContentUtil.sanitizeHtml(formatBackendString(strings.digest.expectedLabel, { value: syncStatus.expectedDelivery }))}</span>`
        : '';
      const carrier = payload.carrier ? ` (${EmailContentUtil.sanitizeHtml(payload.carrier)})` : '';
      const link = payload.trackingUrl
        ? ` <a href="${EmailContentUtil.sanitizeHtml(payload.trackingUrl)}" style="color:#2563eb">${EmailContentUtil.sanitizeHtml(strings.digest.trackLink)}</a>`
        : '';
      return `<li style="margin-bottom:8px"><strong>${EmailContentUtil.sanitizeHtml(a.title)}</strong><span style="color:#666">${status}${location}</span><br><span style="color:#666;font-size:13px">${EmailContentUtil.sanitizeHtml(payload.trackingNumber)}${carrier}</span>${link}${eta}</li>`;
    });
    return this.buildSection(strings.digest.packagesHeading, rows.join(''));
  }

  private static buildFlightsSection(actions: EmailAction[], locale?: string | null): string {
    const strings = getBackendStrings(locale);
    const rows = actions.map((a) => {
      const payload = a.payload as TravelTrackFlightActionPayload;
      let syncStatus: FlightSyncStatus | null = null;
      try {
        if (a.syncStatus) {
          syncStatus = JSON.parse(a.syncStatus) as FlightSyncStatus;
        }
      } catch {
        /*
        ignore parse errors
        */
      }
      const status = syncStatus?.status ? ` — ${EmailContentUtil.sanitizeHtml(syncStatus.status)}` : '';
      const route = [payload.departureAirport, payload.arrivalAirport].filter(Boolean).join(' → ');
      const link = payload.trackingUrl
        ? ` <a href="${EmailContentUtil.sanitizeHtml(payload.trackingUrl)}" style="color:#2563eb">${EmailContentUtil.sanitizeHtml(strings.digest.trackLink)}</a>`
        : '';
      return `<li style="margin-bottom:8px"><strong>${EmailContentUtil.sanitizeHtml(payload.flightNumber)}</strong>${status}<br><span style="color:#666;font-size:13px">${EmailContentUtil.sanitizeHtml(route || a.description)}</span>${link}</li>`;
    });
    return this.buildSection(strings.digest.flightsHeading, rows.join(''));
  }

  private static buildBillsSection(actions: EmailAction[], locale?: string | null): string {
    const strings = getBackendStrings(locale);
    const rows = actions.map((a) => {
      const payload = a.payload as FinancePayBillActionPayload;
      const dueDate = payload.dueDate
        ? ` — ${EmailContentUtil.sanitizeHtml(strings.digest.duePrefix)} ${EmailContentUtil.sanitizeHtml(payload.dueDate)}`
        : '';
      const amount = payload.amount
        ? ` ${EmailContentUtil.sanitizeHtml(payload.currency || '')}${EmailContentUtil.sanitizeHtml(payload.amount)}`
        : '';
      const link = payload.paymentUrl
        ? ` <a href="${EmailContentUtil.sanitizeHtml(payload.paymentUrl)}" style="color:#2563eb">${EmailContentUtil.sanitizeHtml(strings.digest.payLink)}</a>`
        : '';
      return `<li style="margin-bottom:8px"><strong>${EmailContentUtil.sanitizeHtml(payload.payee || a.title)}</strong>${amount}${dueDate}${link}</li>`;
    });
    return this.buildSection(strings.digest.billsHeading, rows.join(''));
  }

  private static buildAppointmentsSection(actions: EmailAction[], locale?: string | null): string {
    const strings = getBackendStrings(locale);
    const rows = actions.map((a) => {
      const payload = a.payload as AppointmentConfirmActionPayload;
      const time = payload.appointmentTime ? ` — ${EmailContentUtil.sanitizeHtml(payload.appointmentTime)}` : '';
      const location = payload.location
        ? ` ${EmailContentUtil.sanitizeHtml(strings.digest.atPrefix)} ${EmailContentUtil.sanitizeHtml(payload.location)}`
        : '';
      return `<li style="margin-bottom:8px"><strong>${EmailContentUtil.sanitizeHtml(payload.serviceType || a.title)}</strong>${time}${location}</li>`;
    });
    return this.buildSection(strings.digest.appointmentsHeading, rows.join(''));
  }

  private static buildSection(heading: string, itemsHtml: string): string {
    return [
      '<div style="margin-bottom:24px">',
      `<h2 style="font-size:15px;font-weight:700;margin:0 0 10px;border-bottom:2px solid #f0f0f0;padding-bottom:6px">${heading}</h2>`,
      `<ul style="margin:0;padding-left:20px">${itemsHtml}</ul>`,
      '</div>',
    ].join('\n');
  }
}

export { DigestEmailBuilder };
export type { DigestSections };
