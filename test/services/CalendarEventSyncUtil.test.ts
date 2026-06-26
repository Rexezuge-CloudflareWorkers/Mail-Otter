import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockListCalendarEventsGmail,
  mockListCalendarEventsOutlook,
  mockUpsertEvents,
} = vi.hoisted(() => ({
  mockListCalendarEventsGmail: vi.fn(),
  mockListCalendarEventsOutlook: vi.fn(),
  mockUpsertEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@mail-otter/provider-clients/gmail', () => ({
  GmailProviderUtil: {
    listCalendarEventsByDateRange: mockListCalendarEventsGmail,
  },
}));

vi.mock('@mail-otter/provider-clients/outlook', () => ({
  OutlookProviderUtil: {
    listCalendarEventsByDateRange: mockListCalendarEventsOutlook,
  },
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  SyncedCalendarEventDAO: vi.fn(function () {
    return { upsertEvents: mockUpsertEvents };
  }),
}));

import { CalendarEventSyncUtil } from '../../packages/backend-services/src/digest/CalendarEventSyncUtil';

const NOW_ISO = '2026-06-26T00:00:00.000Z';
const END_ISO = '2026-06-28T00:00:00.000Z';

function makeGmailApplication() {
  return {
    applicationId: 'app-1',
    providerId: 'google-gmail',
    userEmail: 'user@gmail.com',
    providerEmail: 'user@gmail.com',
    timeZone: 'UTC',
  };
}

function makeOutlookApplication() {
  return {
    applicationId: 'app-1',
    providerId: 'microsoft-outlook',
    userEmail: 'user@outlook.com',
    providerEmail: 'user@outlook.com',
    timeZone: 'UTC',
  };
}

function makeGmailEvent(overrides?: Record<string, unknown>) {
  return {
    id: 'gmail-evt-1',
    summary: 'Team Standup',
    start: { dateTime: '2026-06-26T09:00:00Z', timeZone: 'UTC' },
    end: { dateTime: '2026-06-26T09:30:00Z', timeZone: 'UTC' },
    location: 'Zoom',
    description: 'Daily sync call',
    ...overrides,
  };
}

function makeOutlookEvent(overrides?: Record<string, unknown>) {
  return {
    id: 'outlook-evt-1',
    subject: 'Planning Session',
    start: { dateTime: '2026-06-26T10:00:00', timeZone: 'UTC' },
    end: { dateTime: '2026-06-26T11:00:00', timeZone: 'UTC' },
    location: { displayName: 'Conference Room A' },
    ...overrides,
  };
}

describe('CalendarEventSyncUtil', () => {
  let util: CalendarEventSyncUtil;

  beforeEach(() => {
    vi.clearAllMocks();
    util = new CalendarEventSyncUtil({} as D1Database);
    mockListCalendarEventsGmail.mockResolvedValue([]);
    mockListCalendarEventsOutlook.mockResolvedValue([]);
  });

  describe('syncForApplication — Gmail', () => {
    it('does not upsert when no events returned', async () => {
      mockListCalendarEventsGmail.mockResolvedValue([]);

      await util.syncForApplication(makeGmailApplication() as any, 'access-token', NOW_ISO, END_ISO);

      expect(mockUpsertEvents).not.toHaveBeenCalled();
    });

    it('upserts Gmail events', async () => {
      mockListCalendarEventsGmail.mockResolvedValue([makeGmailEvent()]);

      await util.syncForApplication(makeGmailApplication() as any, 'access-token', NOW_ISO, END_ISO);

      expect(mockUpsertEvents).toHaveBeenCalledOnce();
      const [appId, events] = mockUpsertEvents.mock.calls[0];
      expect(appId).toBe('app-1');
      expect(events).toHaveLength(1);
      expect(events[0].providerEventId).toBe('gmail-evt-1');
      expect(events[0].eventTitle).toBe('Team Standup');
      expect(events[0].timeZone).toBe('UTC');
      expect(events[0].location).toBe('Zoom');
      expect(events[0].notes).toBe('Daily sync call');
    });

    it('filters out Gmail events without dateTime', async () => {
      mockListCalendarEventsGmail.mockResolvedValue([
        makeGmailEvent({ start: { date: '2026-06-26' } }),  // all-day event — no dateTime
        makeGmailEvent({ id: 'evt-2', start: { dateTime: '2026-06-26T14:00:00Z' } }),
      ]);

      await util.syncForApplication(makeGmailApplication() as any, 'access-token', NOW_ISO, END_ISO);

      const [, events] = mockUpsertEvents.mock.calls[0];
      expect(events).toHaveLength(1);
      expect(events[0].providerEventId).toBe('evt-2');
    });

    it('falls back to title "(no title)" for missing summary', async () => {
      mockListCalendarEventsGmail.mockResolvedValue([makeGmailEvent({ summary: undefined })]);

      await util.syncForApplication(makeGmailApplication() as any, 'access-token', NOW_ISO, END_ISO);

      const [, events] = mockUpsertEvents.mock.calls[0];
      expect(events[0].eventTitle).toBe('(no title)');
    });

    it('computes endTime as startTime + 3600 when end.dateTime is absent', async () => {
      const evt = makeGmailEvent({ end: undefined });
      mockListCalendarEventsGmail.mockResolvedValue([evt]);

      await util.syncForApplication(makeGmailApplication() as any, 'access-token', NOW_ISO, END_ISO);

      const [, events] = mockUpsertEvents.mock.calls[0];
      const expectedEnd = events[0].startTime + 3600;
      expect(events[0].endTime).toBe(expectedEnd);
    });

    it('sets location and notes to null when absent', async () => {
      mockListCalendarEventsGmail.mockResolvedValue([
        makeGmailEvent({ location: undefined, description: undefined }),
      ]);

      await util.syncForApplication(makeGmailApplication() as any, 'access-token', NOW_ISO, END_ISO);

      const [, events] = mockUpsertEvents.mock.calls[0];
      expect(events[0].location).toBeNull();
      expect(events[0].notes).toBeNull();
    });
  });

  describe('syncForApplication — Outlook', () => {
    it('does not upsert when no events returned', async () => {
      mockListCalendarEventsOutlook.mockResolvedValue([]);

      await util.syncForApplication(makeOutlookApplication() as any, 'access-token', NOW_ISO, END_ISO);

      expect(mockUpsertEvents).not.toHaveBeenCalled();
    });

    it('upserts Outlook events', async () => {
      mockListCalendarEventsOutlook.mockResolvedValue([makeOutlookEvent()]);

      await util.syncForApplication(makeOutlookApplication() as any, 'access-token', NOW_ISO, END_ISO);

      expect(mockUpsertEvents).toHaveBeenCalledOnce();
      const [appId, events] = mockUpsertEvents.mock.calls[0];
      expect(appId).toBe('app-1');
      expect(events[0].eventTitle).toBe('Planning Session');
      expect(events[0].location).toBe('Conference Room A');
      expect(events[0].notes).toBeNull();
    });

    it('filters out Outlook events without dateTime', async () => {
      mockListCalendarEventsOutlook.mockResolvedValue([
        makeOutlookEvent({ start: { date: '2026-06-26' } }),
        makeOutlookEvent({ id: 'evt-2', subject: 'Late Meeting', start: { dateTime: '2026-06-26T15:00:00' } }),
      ]);

      await util.syncForApplication(makeOutlookApplication() as any, 'access-token', NOW_ISO, END_ISO);

      const [, events] = mockUpsertEvents.mock.calls[0];
      expect(events).toHaveLength(1);
      expect(events[0].eventTitle).toBe('Late Meeting');
    });

    it('falls back to "(no title)" when subject is absent', async () => {
      mockListCalendarEventsOutlook.mockResolvedValue([makeOutlookEvent({ subject: undefined })]);

      await util.syncForApplication(makeOutlookApplication() as any, 'access-token', NOW_ISO, END_ISO);

      const [, events] = mockUpsertEvents.mock.calls[0];
      expect(events[0].eventTitle).toBe('(no title)');
    });

    it('sets location to null when displayName absent', async () => {
      mockListCalendarEventsOutlook.mockResolvedValue([
        makeOutlookEvent({ location: {} }),
      ]);

      await util.syncForApplication(makeOutlookApplication() as any, 'access-token', NOW_ISO, END_ISO);

      const [, events] = mockUpsertEvents.mock.calls[0];
      expect(events[0].location).toBeNull();
    });
  });

  describe('syncForApplication — unsupported provider', () => {
    it('returns without fetching or upserting for Fastmail', async () => {
      const fastmailApp = {
        applicationId: 'app-2',
        providerId: 'fastmail-jmap',
        userEmail: 'user@fastmail.com',
        providerEmail: 'user@fastmail.com',
        timeZone: 'UTC',
      };

      await util.syncForApplication(fastmailApp as any, 'access-token', NOW_ISO, END_ISO);

      expect(mockListCalendarEventsGmail).not.toHaveBeenCalled();
      expect(mockListCalendarEventsOutlook).not.toHaveBeenCalled();
      expect(mockUpsertEvents).not.toHaveBeenCalled();
    });
  });
});
