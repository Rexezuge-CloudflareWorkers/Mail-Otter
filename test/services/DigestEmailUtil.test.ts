import { describe, expect, it } from 'vitest';
import { DigestEmailUtil } from '../../packages/backend-services/src/digest/DigestEmailUtil';
import {
  DIGEST_SECTION_APPOINTMENTS,
  DIGEST_SECTION_BILLS,
  DIGEST_SECTION_CALENDAR,
  DIGEST_SECTION_FLIGHTS,
  DIGEST_SECTION_PACKAGES,
  DIGEST_SECTION_TASKS,
  DIGEST_ALL_SECTIONS,
} from '@mail-otter/shared/constants';

function makeSections() {
  return {
    calendarEvents: [],
    tasks: [],
    packages: [],
    flights: [],
    bills: [],
    appointments: [],
  };
}

function makeCalendarEvent(overrides?: Record<string, unknown>) {
  return {
    syncEventId: 'sync-1',
    applicationId: 'app-1',
    providerEventId: 'evt-1',
    eventTitle: 'Team Meeting',
    startTime: 1_778_200_000,
    endTime: 1_778_203_600,
    timeZone: 'UTC',
    location: 'Zoom',
    notes: null,
    syncedAt: 1_778_200_000,
    ...overrides,
  };
}

function makeAction(actionType: string, payload: Record<string, unknown>) {
  return {
    actionId: 'action-1',
    processedMessageId: 'pm-1',
    applicationId: 'app-1',
    actionType,
    title: `${actionType} Title`,
    description: `${actionType} description`,
    status: 'pending',
    riskLevel: 'low',
    payload,
    syncStatus: null,
    createdAt: 1_778_200_000,
    updatedAt: 1_778_200_000,
    expiresAt: null,
    executedAt: null,
  };
}

describe('DigestEmailUtil', () => {
  describe('buildSubject', () => {
    it('includes the date formatted in the given timezone', () => {
      const date = new Date('2026-06-26T10:00:00Z');
      const subject = DigestEmailUtil.buildSubject(date, 'UTC');
      expect(subject).toContain('Mail-Otter Daily Digest');
      expect(subject).toContain('2026');
      expect(subject).toContain('June');
    });

    it('formats date in specified timezone', () => {
      const date = new Date('2026-06-26T10:00:00Z');
      const utcSubject = DigestEmailUtil.buildSubject(date, 'UTC');
      expect(utcSubject).toContain('Friday');
    });

    it('falls back to UTC for empty timezone', () => {
      const date = new Date('2026-06-26T00:00:00Z');
      const subject = DigestEmailUtil.buildSubject(date, '');
      expect(subject).toContain('Mail-Otter Daily Digest');
    });
  });

  describe('hasContent', () => {
    it('returns false when all sections are empty', () => {
      expect(DigestEmailUtil.hasContent(makeSections(), DIGEST_ALL_SECTIONS)).toBe(false);
    });

    it('returns true when calendar has events', () => {
      const sections = { ...makeSections(), calendarEvents: [makeCalendarEvent()] };
      expect(DigestEmailUtil.hasContent(sections, [DIGEST_SECTION_CALENDAR])).toBe(true);
    });

    it('returns true when tasks has items', () => {
      const sections = {
        ...makeSections(),
        tasks: [makeAction('manual.todo', { instructions: 'Do something' })],
      };
      expect(DigestEmailUtil.hasContent(sections, [DIGEST_SECTION_TASKS])).toBe(true);
    });

    it('returns true when packages has items', () => {
      const sections = {
        ...makeSections(),
        packages: [makeAction('delivery.track_package', { trackingNumber: 'ABC123' })],
      };
      expect(DigestEmailUtil.hasContent(sections, [DIGEST_SECTION_PACKAGES])).toBe(true);
    });

    it('returns true when flights has items', () => {
      const sections = {
        ...makeSections(),
        flights: [makeAction('travel.track_flight', { flightNumber: 'AA100' })],
      };
      expect(DigestEmailUtil.hasContent(sections, [DIGEST_SECTION_FLIGHTS])).toBe(true);
    });

    it('returns true when bills has items', () => {
      const sections = {
        ...makeSections(),
        bills: [makeAction('finance.pay_bill', { payee: 'Electric Co', amount: '150', currency: 'USD' })],
      };
      expect(DigestEmailUtil.hasContent(sections, [DIGEST_SECTION_BILLS])).toBe(true);
    });

    it('returns true when appointments has items', () => {
      const sections = {
        ...makeSections(),
        appointments: [makeAction('appointment.confirm', { serviceType: 'Dentist' })],
      };
      expect(DigestEmailUtil.hasContent(sections, [DIGEST_SECTION_APPOINTMENTS])).toBe(true);
    });

    it('returns false when section has items but is not in enabledSections', () => {
      const sections = { ...makeSections(), calendarEvents: [makeCalendarEvent()] };
      expect(DigestEmailUtil.hasContent(sections, [DIGEST_SECTION_TASKS])).toBe(false);
    });
  });

  describe('buildHtml', () => {
    it('shows empty state message when no content', () => {
      const html = DigestEmailUtil.buildHtml(makeSections(), DIGEST_ALL_SECTIONS);
      expect(html).toContain('Nothing to report today');
    });

    it('includes calendar section when events present', () => {
      const sections = { ...makeSections(), calendarEvents: [makeCalendarEvent()] };
      const html = DigestEmailUtil.buildHtml(sections, [DIGEST_SECTION_CALENDAR]);
      expect(html).toContain('Team Meeting');
      expect(html).toContain("Today's Calendar Events");
    });

    it('includes location in calendar event', () => {
      const sections = { ...makeSections(), calendarEvents: [makeCalendarEvent({ location: 'Conference Room B' })] };
      const html = DigestEmailUtil.buildHtml(sections, [DIGEST_SECTION_CALENDAR]);
      expect(html).toContain('Conference Room B');
    });

    it('renders calendar event without location when absent', () => {
      const sections = { ...makeSections(), calendarEvents: [makeCalendarEvent({ location: null })] };
      const html = DigestEmailUtil.buildHtml(sections, [DIGEST_SECTION_CALENDAR]);
      expect(html).toContain('Team Meeting');
    });

    it('includes tasks section when tasks present', () => {
      const sections = {
        ...makeSections(),
        tasks: [makeAction('manual.todo', { instructions: 'Renew passport' })],
      };
      const html = DigestEmailUtil.buildHtml(sections, [DIGEST_SECTION_TASKS]);
      expect(html).toContain('Pending Tasks');
      expect(html).toContain('Renew passport');
    });

    it('falls back to action description when task has no instructions', () => {
      const task = makeAction('manual.todo', {});
      const sections = { ...makeSections(), tasks: [task] };
      const html = DigestEmailUtil.buildHtml(sections, [DIGEST_SECTION_TASKS]);
      expect(html).toContain(task.description);
    });

    it('includes packages section with tracking info', () => {
      const sections = {
        ...makeSections(),
        packages: [
          makeAction('delivery.track_package', {
            trackingNumber: 'TRK123456',
            carrier: 'UPS',
            trackingUrl: 'https://track.ups.com/abc',
          }),
        ],
      };
      const html = DigestEmailUtil.buildHtml(sections, [DIGEST_SECTION_PACKAGES]);
      expect(html).toContain('Package Deliveries');
      expect(html).toContain('TRK123456');
      expect(html).toContain('UPS');
    });

    it('includes package sync status when present', () => {
      const pkg = makeAction('delivery.track_package', { trackingNumber: 'TRK999' });
      (pkg as any).syncStatus = JSON.stringify({ statusLabel: 'In Transit', location: 'Los Angeles, CA', expectedDelivery: 'Tomorrow' });
      const sections = { ...makeSections(), packages: [pkg] };
      const html = DigestEmailUtil.buildHtml(sections, [DIGEST_SECTION_PACKAGES]);
      expect(html).toContain('In Transit');
      expect(html).toContain('Los Angeles, CA');
      expect(html).toContain('Tomorrow');
    });

    it('handles malformed package syncStatus without throwing', () => {
      const pkg = makeAction('delivery.track_package', { trackingNumber: 'TRK999' });
      (pkg as any).syncStatus = 'not-json';
      const sections = { ...makeSections(), packages: [pkg] };
      expect(() => DigestEmailUtil.buildHtml(sections, [DIGEST_SECTION_PACKAGES])).not.toThrow();
    });

    it('includes flights section', () => {
      const sections = {
        ...makeSections(),
        flights: [
          makeAction('travel.track_flight', {
            flightNumber: 'AA100',
            departureAirport: 'JFK',
            arrivalAirport: 'LAX',
            trackingUrl: 'https://flightaware.com/AA100',
          }),
        ],
      };
      const html = DigestEmailUtil.buildHtml(sections, [DIGEST_SECTION_FLIGHTS]);
      expect(html).toContain('Upcoming Flights');
      expect(html).toContain('AA100');
      expect(html).toContain('JFK → LAX');
    });

    it('includes flight sync status when present', () => {
      const flight = makeAction('travel.track_flight', { flightNumber: 'UA200' });
      (flight as any).syncStatus = JSON.stringify({ status: 'On Time', departureDelay: 0 });
      const sections = { ...makeSections(), flights: [flight] };
      const html = DigestEmailUtil.buildHtml(sections, [DIGEST_SECTION_FLIGHTS]);
      expect(html).toContain('On Time');
    });

    it('includes bills section with amount and due date', () => {
      const sections = {
        ...makeSections(),
        bills: [
          makeAction('finance.pay_bill', {
            payee: 'Electricity Co',
            amount: '120.50',
            currency: 'USD',
            dueDate: '2026-07-01',
            paymentUrl: 'https://pay.example.com',
          }),
        ],
      };
      const html = DigestEmailUtil.buildHtml(sections, [DIGEST_SECTION_BILLS]);
      expect(html).toContain('Bills Due Soon');
      expect(html).toContain('Electricity Co');
      expect(html).toContain('120.50');
      expect(html).toContain('2026-07-01');
    });

    it('includes appointments section with time and location', () => {
      const sections = {
        ...makeSections(),
        appointments: [
          makeAction('appointment.confirm', {
            serviceType: 'Dentist',
            appointmentTime: '2026-07-01T10:00:00',
            location: '123 Main St',
          }),
        ],
      };
      const html = DigestEmailUtil.buildHtml(sections, [DIGEST_SECTION_APPOINTMENTS]);
      expect(html).toContain('Upcoming Appointments');
      expect(html).toContain('Dentist');
      expect(html).toContain('2026-07-01T10:00:00');
      expect(html).toContain('123 Main St');
    });

    it('skips section when disabled in enabledSections', () => {
      const sections = { ...makeSections(), calendarEvents: [makeCalendarEvent()] };
      const html = DigestEmailUtil.buildHtml(sections, [DIGEST_SECTION_TASKS]);
      expect(html).not.toContain("Today's Calendar Events");
    });

    it('wraps output in mail-otter attribution footer', () => {
      const html = DigestEmailUtil.buildHtml(makeSections(), []);
      expect(html).toContain('Mail-Otter');
    });
  });
});
