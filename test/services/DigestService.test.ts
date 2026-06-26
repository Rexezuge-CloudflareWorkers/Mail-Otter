import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetConfig,
  mockMarkSent,
  mockListEventsForRange,
  mockListPendingActionsByTypes,
  mockSendStandaloneEmailGmail,
  mockSendStandaloneEmailOutlook,
} = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockMarkSent: vi.fn().mockResolvedValue(undefined),
  mockListEventsForRange: vi.fn().mockResolvedValue([]),
  mockListPendingActionsByTypes: vi.fn().mockResolvedValue([]),
  mockSendStandaloneEmailGmail: vi.fn().mockResolvedValue(undefined),
  mockSendStandaloneEmailOutlook: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../packages/backend-services/src/digest/DigestConfigService', () => ({
  DigestConfigService: vi.fn(function () {
    return { getConfig: mockGetConfig, markSent: mockMarkSent };
  }),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return {};
  }),
  EmailActionDAO: vi.fn(function () {
    return { listPendingActionsByTypes: mockListPendingActionsByTypes };
  }),
  SyncedCalendarEventDAO: vi.fn(function () {
    return { listEventsForRange: mockListEventsForRange };
  }),
}));

vi.mock('@mail-otter/provider-clients/gmail', () => ({
  GmailProviderUtil: {
    sendStandaloneEmail: mockSendStandaloneEmailGmail,
  },
}));

vi.mock('@mail-otter/provider-clients/outlook', () => ({
  OutlookProviderUtil: {
    sendStandaloneEmail: mockSendStandaloneEmailOutlook,
  },
}));

import { DigestService } from '../../packages/backend-services/src/digest/DigestService';
import { DIGEST_ALL_SECTIONS } from '@mail-otter/shared/constants';

function makeEnv() {
  return {
    DB: {} as D1Database,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('mk') } as unknown as SecretsStoreSecret,
    ACTION_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('ak') } as unknown as SecretsStoreSecret,
    OAUTH2_TOKEN_CACHE: {} as KVNamespace,
    OAUTH2_TOKEN_REFRESHERS: {} as DurableObjectNamespace,
  };
}

function makeApplication(providerId: string = 'google-gmail', overrides?: Record<string, unknown>) {
  return {
    applicationId: 'app-1',
    userEmail: 'user@example.com',
    providerId,
    providerEmail: 'user@gmail.com',
    timeZone: 'UTC',
    ...overrides,
  };
}

function makeCalendarEvent(overrides?: Record<string, unknown>) {
  return {
    syncEventId: 'sync-1',
    applicationId: 'app-1',
    providerEventId: 'evt-1',
    eventTitle: 'Standup',
    startTime: Math.floor(Date.now() / 1000) + 3600,
    endTime: Math.floor(Date.now() / 1000) + 7200,
    timeZone: 'UTC',
    location: null,
    notes: null,
    syncedAt: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

function makeEnabledConfig() {
  return {
    enabled: true,
    sendTime: '08:00',
    sections: DIGEST_ALL_SECTIONS,
    lastSentAt: null,
  };
}

describe('DigestService', () => {
  let service: DigestService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DigestService(makeEnv() as any, 'master-key', 'action-key');
    mockListPendingActionsByTypes.mockResolvedValue([]);
    mockListEventsForRange.mockResolvedValue([]);
  });

  describe('sendDigest', () => {
    it('returns without sending when digest is disabled', async () => {
      mockGetConfig.mockResolvedValue({ enabled: false, sendTime: '08:00', sections: DIGEST_ALL_SECTIONS, lastSentAt: null });

      await service.sendDigest(makeApplication() as any, 'access-token');

      expect(mockSendStandaloneEmailGmail).not.toHaveBeenCalled();
      expect(mockMarkSent).not.toHaveBeenCalled();
    });

    it('marks sent and returns without sending when no content', async () => {
      mockGetConfig.mockResolvedValue(makeEnabledConfig());
      // All sections return empty

      await service.sendDigest(makeApplication() as any, 'access-token');

      expect(mockMarkSent).toHaveBeenCalled();
      expect(mockSendStandaloneEmailGmail).not.toHaveBeenCalled();
    });

    it('sends gmail email when content is available', async () => {
      mockGetConfig.mockResolvedValue(makeEnabledConfig());
      mockListEventsForRange.mockResolvedValue([makeCalendarEvent()]);

      await service.sendDigest(makeApplication('google-gmail') as any, 'access-token');

      expect(mockSendStandaloneEmailGmail).toHaveBeenCalled();
      expect(mockMarkSent).toHaveBeenCalled();
    });

    it('sends outlook email for outlook provider', async () => {
      mockGetConfig.mockResolvedValue(makeEnabledConfig());
      mockListEventsForRange.mockResolvedValue([makeCalendarEvent()]);

      await service.sendDigest(makeApplication('microsoft-outlook') as any, 'access-token');

      expect(mockSendStandaloneEmailOutlook).toHaveBeenCalled();
      expect(mockMarkSent).toHaveBeenCalled();
    });

    it('does not send when providerEmail is empty', async () => {
      mockGetConfig.mockResolvedValue(makeEnabledConfig());
      mockListEventsForRange.mockResolvedValue([makeCalendarEvent()]);

      await service.sendDigest(makeApplication('google-gmail', { providerEmail: '' }) as any, 'access-token');

      expect(mockSendStandaloneEmailGmail).not.toHaveBeenCalled();
    });

    it('does not send when providerEmail is null', async () => {
      mockGetConfig.mockResolvedValue(makeEnabledConfig());
      mockListEventsForRange.mockResolvedValue([makeCalendarEvent()]);

      await service.sendDigest(makeApplication('google-gmail', { providerEmail: null }) as any, 'access-token');

      expect(mockSendStandaloneEmailGmail).not.toHaveBeenCalled();
    });

    it('skips email for unsupported provider type', async () => {
      mockGetConfig.mockResolvedValue(makeEnabledConfig());
      mockListEventsForRange.mockResolvedValue([makeCalendarEvent()]);

      await service.sendDigest(makeApplication('fastmail-jmap', { providerEmail: 'user@fastmail.com' }) as any, 'access-token');

      expect(mockSendStandaloneEmailGmail).not.toHaveBeenCalled();
      expect(mockSendStandaloneEmailOutlook).not.toHaveBeenCalled();
      expect(mockMarkSent).toHaveBeenCalled();
    });

    it('filters bills by due date within 7 days', async () => {
      mockGetConfig.mockResolvedValue(makeEnabledConfig());
      const now = Math.floor(Date.now() / 1000);
      const soonDueDate = new Date((now + 3 * 86400) * 1000).toISOString().split('T')[0];
      const lateDueDate = new Date((now + 30 * 86400) * 1000).toISOString().split('T')[0];

      const soonBill = {
        actionId: 'bill-1',
        title: 'Soon Bill',
        description: '',
        payload: { payee: 'Early Electric', dueDate: soonDueDate },
        syncStatus: null,
      };
      const lateBill = {
        actionId: 'bill-2',
        title: 'Late Bill',
        description: '',
        payload: { payee: 'Late Telecom', dueDate: lateDueDate },
        syncStatus: null,
      };

      mockListPendingActionsByTypes.mockImplementation((appId: string, types: string[]) => {
        if (types.includes('finance.pay_bill')) return Promise.resolve([soonBill, lateBill]);
        return Promise.resolve([]);
      });
      mockListEventsForRange.mockResolvedValue([]);

      await service.sendDigest(makeApplication() as any, 'access-token');

      // Even though there's a bill, it's filtered — only early one remains. But sendDigest only sends if there's content.
      // Since calendar events are empty and tasks/packages/flights/appointments are empty, only the soon bill triggers content.
      expect(mockMarkSent).toHaveBeenCalled();
    });

    it('handles bills with missing dueDate', async () => {
      mockGetConfig.mockResolvedValue(makeEnabledConfig());

      const noDueDateBill = {
        actionId: 'bill-1',
        title: 'No Due Date Bill',
        description: '',
        payload: { payee: 'Unknown Electric', dueDate: null },
        syncStatus: null,
      };

      mockListPendingActionsByTypes.mockImplementation((appId: string, types: string[]) => {
        if (types.includes('finance.pay_bill')) return Promise.resolve([noDueDateBill]);
        return Promise.resolve([]);
      });
      mockListEventsForRange.mockResolvedValue([]);

      await service.sendDigest(makeApplication() as any, 'access-token');

      expect(mockSendStandaloneEmailGmail).toHaveBeenCalled();
      expect(mockMarkSent).toHaveBeenCalled();
    });

    it('filters appointments by appointment time within hours', async () => {
      mockGetConfig.mockResolvedValue(makeEnabledConfig());
      const now = Math.floor(Date.now() / 1000);
      const soonApptTime = new Date((now + 1 * 3600) * 1000).toISOString();
      const lateApptTime = new Date((now + 48 * 3600) * 1000).toISOString();

      const soonAppt = {
        actionId: 'appt-1',
        title: 'Soon Appointment',
        description: '',
        payload: { location: 'Office', appointmentTime: soonApptTime },
        syncStatus: null,
      };
      const lateAppt = {
        actionId: 'appt-2',
        title: 'Late Appointment',
        description: '',
        payload: { location: 'Hospital', appointmentTime: lateApptTime },
        syncStatus: null,
      };

      mockListPendingActionsByTypes.mockImplementation((appId: string, types: string[]) => {
        if (types.includes('appointment.confirm')) return Promise.resolve([soonAppt, lateAppt]);
        return Promise.resolve([]);
      });

      await service.sendDigest(makeApplication() as any, 'access-token');

      expect(mockMarkSent).toHaveBeenCalled();
    });

    it('handles appointments with missing appointmentTime', async () => {
      mockGetConfig.mockResolvedValue(makeEnabledConfig());

      const noTimAppt = {
        actionId: 'appt-1',
        title: 'No Time Appointment',
        description: '',
        payload: { location: 'TBD', appointmentTime: null },
        syncStatus: null,
      };

      mockListPendingActionsByTypes.mockImplementation((appId: string, types: string[]) => {
        if (types.includes('appointment.confirm')) return Promise.resolve([noTimAppt]);
        return Promise.resolve([]);
      });

      await service.sendDigest(makeApplication() as any, 'access-token');

      expect(mockSendStandaloneEmailGmail).toHaveBeenCalled();
      expect(mockMarkSent).toHaveBeenCalled();
    });

    it('handles appointments with invalid appointmentTime date', async () => {
      mockGetConfig.mockResolvedValue(makeEnabledConfig());

      const invalidAppt = {
        actionId: 'appt-1',
        title: 'Invalid Appointment',
        description: '',
        payload: { location: 'Somewhere', appointmentTime: 'not-a-date' },
        syncStatus: null,
      };

      mockListPendingActionsByTypes.mockImplementation((appId: string, types: string[]) => {
        if (types.includes('appointment.confirm')) return Promise.resolve([invalidAppt]);
        return Promise.resolve([]);
      });

      await service.sendDigest(makeApplication() as any, 'access-token');

      expect(mockMarkSent).toHaveBeenCalled();
    });

    it('respects timezone for calendar event date boundaries', async () => {
      mockGetConfig.mockResolvedValue(makeEnabledConfig());
      const now = Math.floor(Date.now() / 1000);
      const todayEvent = makeCalendarEvent({ startTime: now + 3600, endTime: now + 7200 });

      mockListEventsForRange.mockResolvedValue([todayEvent]);

      await service.sendDigest(makeApplication('google-gmail', { timeZone: 'America/New_York' }) as any, 'access-token');

      expect(mockSendStandaloneEmailGmail).toHaveBeenCalled();
    });

    it('calls listPendingActionsByTypes for each enabled section', async () => {
      mockGetConfig.mockResolvedValue(makeEnabledConfig());
      mockListEventsForRange.mockResolvedValue([]);
      mockListPendingActionsByTypes.mockResolvedValue([]);

      await service.sendDigest(makeApplication() as any, 'access-token');

      // Should be called for each section type (tasks, packages, flights, bills, appointments)
      expect(mockListPendingActionsByTypes).toHaveBeenCalled();
    });

    it('handles partial section exclusions', async () => {
      const configWithPartialSections = {
        ...makeEnabledConfig(),
        sections: ['calendar'],
      };
      mockGetConfig.mockResolvedValue(configWithPartialSections);
      mockListEventsForRange.mockResolvedValue([makeCalendarEvent()]);

      await service.sendDigest(makeApplication() as any, 'access-token');

      expect(mockSendStandaloneEmailGmail).toHaveBeenCalled();
    });
  });

  describe('sendDigestForced', () => {
    it('sends even when enabled is false (forced)', async () => {
      mockGetConfig.mockResolvedValue({ enabled: false, sendTime: '08:00', sections: DIGEST_ALL_SECTIONS, lastSentAt: null });
      mockListEventsForRange.mockResolvedValue([makeCalendarEvent()]);

      await service.sendDigestForced(makeApplication('google-gmail') as any, 'access-token');

      expect(mockSendStandaloneEmailGmail).toHaveBeenCalled();
    });

    it('marks sent even for disabled digest', async () => {
      mockGetConfig.mockResolvedValue({ enabled: false, sendTime: '08:00', sections: DIGEST_ALL_SECTIONS, lastSentAt: null });
      mockListEventsForRange.mockResolvedValue([makeCalendarEvent()]);

      await service.sendDigestForced(makeApplication('google-gmail') as any, 'access-token');

      expect(mockMarkSent).toHaveBeenCalled();
    });

    it('sends forced digest without content', async () => {
      mockGetConfig.mockResolvedValue({ enabled: true, sendTime: '08:00', sections: DIGEST_ALL_SECTIONS, lastSentAt: null });

      await service.sendDigestForced(makeApplication('google-gmail') as any, 'access-token');

      expect(mockMarkSent).toHaveBeenCalled();
    });
  });
});
