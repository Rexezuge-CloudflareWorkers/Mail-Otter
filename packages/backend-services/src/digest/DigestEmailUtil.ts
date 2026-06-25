import { EmailContentUtil } from '@mail-otter/provider-clients/email-content';
import {
  DIGEST_SECTION_APPOINTMENTS,
  DIGEST_SECTION_BILLS,
  DIGEST_SECTION_CALENDAR,
  DIGEST_SECTION_FLIGHTS,
  DIGEST_SECTION_PACKAGES,
  DIGEST_SECTION_TASKS,
} from '@mail-otter/shared/constants';
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

class DigestEmailUtil {
  public static buildSubject(date: Date, timeZone: string): string {
    const localDate = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
    return `Mail-Otter Daily Digest — ${localDate}`;
  }

  public static buildHtml(sections: DigestSections, enabledSections: string[]): string {
    const parts: string[] = [
      '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a">',
      '<h1 style="font-size:20px;font-weight:700;margin:0 0 4px">Mail-Otter Daily Digest</h1>',
      '<p style="font-size:13px;color:#666;margin:0 0 24px">Your actionable items for today.</p>',
    ];

    let hasContent = false;

    if (enabledSections.includes(DIGEST_SECTION_CALENDAR) && sections.calendarEvents.length > 0) {
      parts.push(this.buildCalendarSection(sections.calendarEvents));
      hasContent = true;
    }
    if (enabledSections.includes(DIGEST_SECTION_TASKS) && sections.tasks.length > 0) {
      parts.push(this.buildTasksSection(sections.tasks));
      hasContent = true;
    }
    if (enabledSections.includes(DIGEST_SECTION_PACKAGES) && sections.packages.length > 0) {
      parts.push(this.buildPackagesSection(sections.packages));
      hasContent = true;
    }
    if (enabledSections.includes(DIGEST_SECTION_FLIGHTS) && sections.flights.length > 0) {
      parts.push(this.buildFlightsSection(sections.flights));
      hasContent = true;
    }
    if (enabledSections.includes(DIGEST_SECTION_BILLS) && sections.bills.length > 0) {
      parts.push(this.buildBillsSection(sections.bills));
      hasContent = true;
    }
    if (enabledSections.includes(DIGEST_SECTION_APPOINTMENTS) && sections.appointments.length > 0) {
      parts.push(this.buildAppointmentsSection(sections.appointments));
      hasContent = true;
    }

    if (!hasContent) {
      parts.push('<p style="color:#666;font-size:14px">Nothing to report today. Enjoy your inbox-free morning!</p>');
    }

    parts.push(
      '<p style="font-size:11px;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:12px">',
      'Sent by <strong>Mail-Otter</strong>. Manage your digest settings in the Mail-Otter dashboard.',
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

  private static buildCalendarSection(events: SyncedCalendarEvent[]): string {
    const rows = events.map((ev) => {
      const start = new Date(ev.startTime * 1000).toLocaleTimeString('en-US', { timeZone: ev.timeZone, hour: '2-digit', minute: '2-digit', hour12: true });
      const end = new Date(ev.endTime * 1000).toLocaleTimeString('en-US', { timeZone: ev.timeZone, hour: '2-digit', minute: '2-digit', hour12: true });
      const location = ev.location ? `<span style="color:#666"> · ${EmailContentUtil.sanitizeHtml(ev.location)}</span>` : '';
      return `<li style="margin-bottom:8px"><strong>${EmailContentUtil.sanitizeHtml(ev.eventTitle)}</strong> <span style="color:#666">${start}–${end}</span>${location}</li>`;
    });
    return this.buildSection('📅 Today\'s Calendar Events', rows.join(''));
  }

  private static buildTasksSection(actions: EmailAction[]): string {
    const rows = actions.map((a) => {
      const payload = a.payload as ManualTodoActionPayload;
      return `<li style="margin-bottom:8px"><strong>${EmailContentUtil.sanitizeHtml(a.title)}</strong><br><span style="color:#666;font-size:13px">${EmailContentUtil.sanitizeHtml(payload.instructions || a.description)}</span></li>`;
    });
    return this.buildSection('✅ Pending Tasks', rows.join(''));
  }

  private static buildPackagesSection(actions: EmailAction[]): string {
    const rows = actions.map((a) => {
      const payload = a.payload as DeliveryTrackPackageActionPayload;
      let syncStatus: PackageSyncStatus | null = null;
      try {
        if (a.syncStatus) {
          syncStatus = JSON.parse(a.syncStatus) as PackageSyncStatus;
        }
      } catch { /* ignore parse errors */ }
      const statusLabel = syncStatus?.statusLabel ?? syncStatus?.status;
      const status = statusLabel ? ` — ${EmailContentUtil.sanitizeHtml(statusLabel)}` : '';
      const location = syncStatus?.location ? ` · ${EmailContentUtil.sanitizeHtml(syncStatus.location)}` : '';
      const eta = syncStatus?.expectedDelivery ? `<br><span style="color:#666;font-size:13px">Expected: ${EmailContentUtil.sanitizeHtml(syncStatus.expectedDelivery)}</span>` : '';
      const carrier = payload.carrier ? ` (${EmailContentUtil.sanitizeHtml(payload.carrier)})` : '';
      const link = payload.trackingUrl ? ` <a href="${EmailContentUtil.sanitizeHtml(payload.trackingUrl)}" style="color:#2563eb">Track</a>` : '';
      return `<li style="margin-bottom:8px"><strong>${EmailContentUtil.sanitizeHtml(a.title)}</strong><span style="color:#666">${status}${location}</span><br><span style="color:#666;font-size:13px">${EmailContentUtil.sanitizeHtml(payload.trackingNumber)}${carrier}</span>${link}${eta}</li>`;
    });
    return this.buildSection('📦 Package Deliveries', rows.join(''));
  }

  private static buildFlightsSection(actions: EmailAction[]): string {
    const rows = actions.map((a) => {
      const payload = a.payload as TravelTrackFlightActionPayload;
      let syncStatus: FlightSyncStatus | null = null;
      try {
        if (a.syncStatus) {
          syncStatus = JSON.parse(a.syncStatus) as FlightSyncStatus;
        }
      } catch { /* ignore parse errors */ }
      const status = syncStatus?.status ? ` — ${EmailContentUtil.sanitizeHtml(syncStatus.status)}` : '';
      const route = [payload.departureAirport, payload.arrivalAirport].filter(Boolean).join(' → ');
      const link = payload.trackingUrl ? ` <a href="${EmailContentUtil.sanitizeHtml(payload.trackingUrl)}" style="color:#2563eb">Track</a>` : '';
      return `<li style="margin-bottom:8px"><strong>${EmailContentUtil.sanitizeHtml(payload.flightNumber)}</strong>${status}<br><span style="color:#666;font-size:13px">${EmailContentUtil.sanitizeHtml(route || a.description)}</span>${link}</li>`;
    });
    return this.buildSection('✈️ Upcoming Flights', rows.join(''));
  }

  private static buildBillsSection(actions: EmailAction[]): string {
    const rows = actions.map((a) => {
      const payload = a.payload as FinancePayBillActionPayload;
      const dueDate = payload.dueDate ? ` — due ${EmailContentUtil.sanitizeHtml(payload.dueDate)}` : '';
      const amount = payload.amount ? ` ${EmailContentUtil.sanitizeHtml(payload.currency || '')}${EmailContentUtil.sanitizeHtml(payload.amount)}` : '';
      const link = payload.paymentUrl ? ` <a href="${EmailContentUtil.sanitizeHtml(payload.paymentUrl)}" style="color:#2563eb">Pay</a>` : '';
      return `<li style="margin-bottom:8px"><strong>${EmailContentUtil.sanitizeHtml(payload.payee || a.title)}</strong>${amount}${dueDate}${link}</li>`;
    });
    return this.buildSection('💳 Bills Due Soon', rows.join(''));
  }

  private static buildAppointmentsSection(actions: EmailAction[]): string {
    const rows = actions.map((a) => {
      const payload = a.payload as AppointmentConfirmActionPayload;
      const time = payload.appointmentTime ? ` — ${EmailContentUtil.sanitizeHtml(payload.appointmentTime)}` : '';
      const location = payload.location ? ` at ${EmailContentUtil.sanitizeHtml(payload.location)}` : '';
      return `<li style="margin-bottom:8px"><strong>${EmailContentUtil.sanitizeHtml(payload.serviceType || a.title)}</strong>${time}${location}</li>`;
    });
    return this.buildSection('📋 Upcoming Appointments', rows.join(''));
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

export { DigestEmailUtil };
export type { DigestSections };
