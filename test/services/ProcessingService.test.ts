import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockListTaskRunsForUser,
  mockListCalendarEventsForUser,
  mockListProcessedMessagesForUser,
  mockGetByIdForUser,
  mockGetAccessToken,
  mockSyncForApplication,
  mockSyncPackageActions,
  mockSyncFlightActions,
} = vi.hoisted(() => ({
  mockListTaskRunsForUser: vi.fn().mockResolvedValue({ runs: [], nextCursor: undefined }),
  mockListCalendarEventsForUser: vi.fn().mockResolvedValue({ events: [], nextCursor: undefined }),
  mockListProcessedMessagesForUser: vi.fn().mockResolvedValue({ messages: [], nextCursor: undefined }),
  mockGetByIdForUser: vi.fn(),
  mockGetAccessToken: vi.fn().mockResolvedValue('access-token'),
  mockSyncForApplication: vi.fn().mockResolvedValue(undefined),
  mockSyncPackageActions: vi.fn().mockResolvedValue(undefined),
  mockSyncFlightActions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  BackgroundTaskRunDAO: vi.fn(function () {
    return { listForUser: mockListTaskRunsForUser };
  }),
  SyncedCalendarEventDAO: vi.fn(function () {
    return { listForUser: mockListCalendarEventsForUser };
  }),
  ProcessedMessageDAO: vi.fn(function () {
    return { listForUser: mockListProcessedMessagesForUser };
  }),
  ConnectedApplicationDAO: vi.fn(function () {
    return { getByIdForUser: mockGetByIdForUser };
  }),
}));

vi.mock('@mail-otter/backend-services/oauth2', () => ({
  OAuth2AccessTokenService: vi.fn(function () {
    return { getAccessToken: mockGetAccessToken };
  }),
}));

vi.mock('../../packages/backend-services/src/digest', () => ({
  CalendarEventSyncUtil: vi.fn(function () {
    return { syncForApplication: mockSyncForApplication };
  }),
  ActionStatusSyncUtil: vi.fn(function () {
    return {
      syncPackageActions: mockSyncPackageActions,
      syncFlightActions: mockSyncFlightActions,
    };
  }),
}));

vi.mock('@mail-otter/backend-runtime/config', () => ({
  ConfigurationManager: {
    digest: {
      getPackageTrackingApiKey: vi.fn(() => 'pkg-api-key'),
      getFlightTrackingApiKey: vi.fn(() => 'flt-api-key'),
    },
  },
}));

import { ProcessingService } from '@mail-otter/backend-services/processing';
import { BadRequestError } from '@mail-otter/backend-errors';

function makeEnv() {
  return {
    DB: {} as D1Database,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master-key') } as unknown as SecretsStoreSecret,
    ACTION_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('action-key') } as unknown as SecretsStoreSecret,
    OAUTH2_TOKEN_CACHE: {} as KVNamespace,
    OAUTH2_TOKEN_REFRESHERS: {} as DurableObjectNamespace,
  };
}

function makeApplication(overrides?: Record<string, unknown>) {
  return {
    applicationId: 'app-1',
    userEmail: 'user@example.com',
    providerId: 'google-gmail',
    providerEmail: 'user@gmail.com',
    timeZone: 'UTC',
    ...overrides,
  };
}

describe('ProcessingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listTaskRuns', () => {
    it('delegates to BackgroundTaskRunDAO.listForUser', async () => {
      const result = await ProcessingService.listTaskRuns(
        'user@example.com',
        { taskType: 'calendar_sync', applicationId: 'app-1', status: undefined, cursor: undefined, latestPerType: undefined },
        { DB: {} as D1Database },
      );

      expect(mockListTaskRunsForUser).toHaveBeenCalledWith('user@example.com', expect.objectContaining({
        taskType: 'calendar_sync',
        applicationId: 'app-1',
      }));
      expect(result.runs).toHaveLength(0);
    });

    it('sets latestPerType: true when no taskType provided', async () => {
      await ProcessingService.listTaskRuns(
        'user@example.com',
        { taskType: undefined, applicationId: undefined, status: undefined, cursor: undefined, latestPerType: undefined },
        { DB: {} as D1Database },
      );

      expect(mockListTaskRunsForUser).toHaveBeenCalledWith('user@example.com', expect.objectContaining({
        latestPerType: true,
      }));
    });

    it('sets latestPerType: false when taskType is specified', async () => {
      await ProcessingService.listTaskRuns(
        'user@example.com',
        { taskType: 'calendar_sync', applicationId: undefined, status: undefined, cursor: undefined, latestPerType: undefined },
        { DB: {} as D1Database },
      );

      expect(mockListTaskRunsForUser).toHaveBeenCalledWith('user@example.com', expect.objectContaining({
        latestPerType: false,
      }));
    });
  });

  describe('listCalendarEvents', () => {
    it('delegates to SyncedCalendarEventDAO.listForUser', async () => {
      const result = await ProcessingService.listCalendarEvents(
        'user@example.com',
        { applicationId: 'app-1', cursor: undefined },
        { DB: {} as D1Database },
      );

      expect(mockListCalendarEventsForUser).toHaveBeenCalledWith('user@example.com', {
        applicationId: 'app-1',
        cursor: undefined,
      });
      expect(result.events).toHaveLength(0);
    });
  });

  describe('listProcessedMessages', () => {
    it('delegates to ProcessedMessageDAO.listForUser', async () => {
      const result = await ProcessingService.listProcessedMessages(
        'user@example.com',
        { applicationId: 'app-1', status: 'processed', cursor: undefined },
        { DB: {} as D1Database },
      );

      expect(mockListProcessedMessagesForUser).toHaveBeenCalledWith('user@example.com', {
        applicationId: 'app-1',
        status: 'processed',
        cursor: undefined,
      });
      expect(result.messages).toHaveLength(0);
    });
  });

  describe('triggerTask', () => {
    it('throws BadRequestError for unsupported task type', async () => {
      await expect(
        ProcessingService.triggerTask('user@example.com', 'invalid_task', 'app-1', makeEnv() as any),
      ).rejects.toThrow(BadRequestError);
    });

    it('throws BadRequestError when application not found', async () => {
      mockGetByIdForUser.mockResolvedValue(null);

      await expect(
        ProcessingService.triggerTask('user@example.com', 'calendar_sync', 'app-1', makeEnv() as any),
      ).rejects.toThrow(BadRequestError);
    });

    it('triggers calendar_sync task successfully', async () => {
      mockGetByIdForUser.mockResolvedValue(makeApplication());

      await ProcessingService.triggerTask('user@example.com', 'calendar_sync', 'app-1', makeEnv() as any);

      expect(mockGetAccessToken).toHaveBeenCalled();
      expect(mockSyncForApplication).toHaveBeenCalled();
    });

    it('triggers action_status_sync with package and flight APIs', async () => {
      mockGetByIdForUser.mockResolvedValue(makeApplication());

      await ProcessingService.triggerTask('user@example.com', 'action_status_sync', 'app-1', makeEnv() as any);

      expect(mockSyncPackageActions).toHaveBeenCalledWith('app-1', 'pkg-api-key');
      expect(mockSyncFlightActions).toHaveBeenCalledWith('app-1', 'flt-api-key');
    });

    it('skips package sync when no API key configured', async () => {
      const { ConfigurationManager } = await import('@mail-otter/backend-runtime/config');
      vi.mocked(ConfigurationManager.digest.getPackageTrackingApiKey).mockReturnValueOnce('');
      mockGetByIdForUser.mockResolvedValue(makeApplication());

      await ProcessingService.triggerTask('user@example.com', 'action_status_sync', 'app-1', makeEnv() as any);

      expect(mockSyncPackageActions).not.toHaveBeenCalled();
    });

    it('skips flight sync when no API key configured', async () => {
      const { ConfigurationManager } = await import('@mail-otter/backend-runtime/config');
      vi.mocked(ConfigurationManager.digest.getFlightTrackingApiKey).mockReturnValueOnce('');
      mockGetByIdForUser.mockResolvedValue(makeApplication());

      await ProcessingService.triggerTask('user@example.com', 'action_status_sync', 'app-1', makeEnv() as any);

      expect(mockSyncFlightActions).not.toHaveBeenCalled();
    });
  });
});
