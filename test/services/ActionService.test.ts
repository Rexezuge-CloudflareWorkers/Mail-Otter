import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreate,
  mockDeleteByProcessedMessageId,
  mockGetForUser,
  mockGetByTokenHash,
  mockListActionsForUser,
  mockListExecutionsForUser,
  mockExpirePendingActions,
  mockDeleteOlderThan,
  mockClaimForExecution,
  mockMarkSucceeded,
  mockMarkFailed,
  mockMarkExpired,
  mockRecordExecution,
  mockGetById,
  mockUpdateSyncStatus,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockDeleteByProcessedMessageId: vi.fn(),
  mockGetForUser: vi.fn(),
  mockGetByTokenHash: vi.fn(),
  mockListActionsForUser: vi.fn(),
  mockListExecutionsForUser: vi.fn(),
  mockExpirePendingActions: vi.fn(),
  mockDeleteOlderThan: vi.fn(),
  mockClaimForExecution: vi.fn(),
  mockMarkSucceeded: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockMarkExpired: vi.fn(),
  mockRecordExecution: vi.fn(),
  mockGetById: vi.fn(),
  mockUpdateSyncStatus: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  EmailActionDAO: vi.fn(function () {
    return {
      create: mockCreate,
      deleteByProcessedMessageId: mockDeleteByProcessedMessageId,
      getForUser: mockGetForUser,
      getByTokenHash: mockGetByTokenHash,
      listActionsForUser: mockListActionsForUser,
      listExecutionsForUser: mockListExecutionsForUser,
      expirePendingActions: mockExpirePendingActions,
      deleteOlderThan: mockDeleteOlderThan,
      claimForExecution: mockClaimForExecution,
      markSucceeded: mockMarkSucceeded,
      markFailed: mockMarkFailed,
      markExpired: mockMarkExpired,
      recordExecution: mockRecordExecution,
      updateSyncStatus: mockUpdateSyncStatus,
    };
  }),
  ConnectedApplicationDAO: vi.fn(function () {
    return { getById: mockGetById };
  }),
}));

vi.mock('@mail-otter/backend-runtime/config', () => ({
  ConfigurationManager: {
    getActionCallbackBaseUrl: vi.fn(() => ''),
    getActionDefaultExpiryHours: vi.fn(() => 24),
    getActionRetentionDays: vi.fn(() => 30),
    digest: {
      getPackageTrackingApiKey: vi.fn(() => ''),
      getFlightTrackingApiKey: vi.fn(() => ''),
    },
  },
}));

vi.mock('@mail-otter/shared/utils', () => ({
  TimestampUtil: {
    getCurrentUnixTimestampInSeconds: vi.fn(() => 1_778_200_000),
    addHours: vi.fn((ts: number, h: number) => ts + h * 3600),
    subtractDays: vi.fn((ts: number, d: number) => ts - d * 86_400),
  },
  CryptoUtil: {
    randomBase64Url: vi.fn(() => 'random-token'),
    hmacSha256Hex: vi.fn(async () => 'hashed-token'),
  },
  UUIDUtil: {
    getRandomUUID: vi.fn(() => 'action-uuid'),
  },
}));

vi.mock('../../packages/backend-services/src/oauth2/OAuth2AccessTokenService', () => ({
  OAuth2AccessTokenService: vi.fn(function () {
    return { getAccessToken: vi.fn(async () => 'access-token') };
  }),
}));

const { mockFetchStatus } = vi.hoisted(() => ({ mockFetchStatus: vi.fn() }));
vi.mock('../../packages/backend-services/src/action/PackageTrackingService', () => ({
  fetchStatus: mockFetchStatus,
}));

const { mockFetchFlightStatus, mockFormatFlightSummary } = vi.hoisted(() => ({
  mockFetchFlightStatus: vi.fn(),
  mockFormatFlightSummary: vi.fn(),
}));
vi.mock('../../packages/backend-services/src/action/FlightTrackingService', () => ({
  fetchFlightStatus: mockFetchFlightStatus,
  formatFlightSummary: mockFormatFlightSummary,
}));

vi.mock('@mail-otter/provider-clients/gmail', () => ({
  GmailProviderUtil: {
    createCalendarEvent: vi.fn(),
    getMessage: vi.fn(),
    createDraftReply: vi.fn(),
  },
}));

vi.mock('@mail-otter/provider-clients/outlook', () => ({
  OutlookProviderUtil: {
    createCalendarEvent: vi.fn(),
    createDraftReply: vi.fn(),
  },
}));

import { ActionService } from '../../packages/backend-services/src/action/ActionService';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';

const NOW = 1_778_200_000;
const FUTURE_EXPIRY = NOW + 86_400;

function makeEnv(overrides?: Record<string, unknown>) {
  return {
    DB: {} as D1Database,
    ACTION_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('enc-key') },
    ACTION_SIGNING_SECRET: { get: vi.fn().mockResolvedValue('sign-key') },
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('aes-key') },
    OAUTH2_TOKEN_CACHE: {} as KVNamespace,
    OAUTH2_TOKEN_REFRESHERS: {} as DurableObjectNamespace,
    ...overrides,
  };
}

function makeAction(overrides?: Record<string, unknown>) {
  return {
    actionId: 'action-1',
    applicationId: 'app-1',
    userEmail: 'user@example.com',
    providerId: 'google-gmail',
    title: 'Test Action',
    description: 'Do something',
    actionType: 'manual.todo',
    riskLevel: 'low',
    status: 'pending',
    tokenHash: 'hashed-token',
    payload: { type: 'manual.todo', title: 'Test Action', description: 'Do something', instructions: 'Just do it' },
    expiresAt: FUTURE_EXPIRY,
    providerMessageId: 'msg-1',
    providerThreadId: 'thread-1',
    errorMessage: null,
    result: null,
    ...overrides,
  };
}

describe('ActionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('renderActionItems', () => {
    it('renders each action as an HTML list item', () => {
      const action = makeAction();
      const items = ActionService.renderActionItems([
        { action: action as never, token: 'tok', confirmationUrl: 'https://example.com/api/actions/action-1?token=tok' },
      ]);

      expect(items).toHaveLength(1);
      expect(items[0]).toContain('<li>');
      expect(items[0]).toContain('Test Action');
      expect(items[0]).toContain('https://example.com/api/actions/action-1?token=tok');
    });

    it('returns empty array when no actions provided', () => {
      expect(ActionService.renderActionItems([])).toEqual([]);
    });

    it('escapes HTML special characters in title', () => {
      const action = makeAction({ title: '<script>alert("xss")</script>' });
      const items = ActionService.renderActionItems([
        { action: action as never, token: 'tok', confirmationUrl: 'https://example.com/confirm' },
      ]);
      expect(items[0]).not.toContain('<script>');
      expect(items[0]).toContain('&lt;script&gt;');
    });
  });

  describe('renderEmailActionSection', () => {
    it('returns empty string for zero actions', () => {
      expect(ActionService.renderEmailActionSection([])).toBe('');
    });

    it('renders a section wrapping the action list', () => {
      const action = makeAction();
      const html = ActionService.renderEmailActionSection([
        { action: action as never, token: 'tok', confirmationUrl: 'https://example.com/confirm' },
      ]);

      expect(html).toContain('<ul>');
      expect(html).toContain('Actions');
      expect(html).toContain('</ul>');
    });
  });

  describe('expirePendingActions', () => {
    it('passes current timestamp and limit to DAO and returns count', async () => {
      mockExpirePendingActions.mockResolvedValue(3);

      const result = await ActionService.expirePendingActions(makeEnv(), 100);

      expect(result).toBe(3);
      expect(mockExpirePendingActions).toHaveBeenCalledWith(NOW, 100);
    });
  });

  describe('deleteOldActions', () => {
    it('calculates retention cutoff and delegates deletion, returning count', async () => {
      mockDeleteOlderThan.mockResolvedValue(7);

      const result = await ActionService.deleteOldActions(makeEnv(), 200);

      expect(result).toBe(7);
      expect(mockDeleteOlderThan).toHaveBeenCalledWith(expect.any(Number), 200);
    });
  });

  describe('listActionsForUser', () => {
    it('delegates to DAO and returns list', async () => {
      mockListActionsForUser.mockResolvedValue({ items: [makeAction()], cursor: null });

      const result = await ActionService.listActionsForUser('user@example.com', { applicationId: 'app-1' }, makeEnv());

      expect(result.items).toHaveLength(1);
      expect(mockListActionsForUser).toHaveBeenCalledWith('user@example.com', { applicationId: 'app-1' });
    });
  });

  describe('listExecutionsForUser', () => {
    it('delegates to DAO and returns execution list', async () => {
      mockListExecutionsForUser.mockResolvedValue({ items: [], cursor: null });

      const result = await ActionService.listExecutionsForUser('action-1', 'user@example.com', makeEnv());

      expect(result).toEqual({ items: [], cursor: null });
      expect(mockListExecutionsForUser).toHaveBeenCalledWith('action-1', 'user@example.com');
    });
  });

  describe('getConfirmationResponse', () => {
    it('returns 404 when action is not found by token hash', async () => {
      mockGetByTokenHash.mockResolvedValue(undefined);

      const result = await ActionService.getConfirmationResponse('action-1', 'bad-token', makeEnv());

      expect(result.statusCode).toBe(404);
      expect(result.html).toContain('Action not found');
    });

    it('returns 200 with confirmation page when action is found', async () => {
      mockGetByTokenHash.mockResolvedValue(makeAction());

      const result = await ActionService.getConfirmationResponse('action-1', 'valid-token', makeEnv());

      expect(result.statusCode).toBe(200);
      expect(result.html).toContain('Test Action');
      expect(result.html).toContain('<!doctype html>');
    });

    it('renders expired indicator for an expired action', async () => {
      mockGetByTokenHash.mockResolvedValue(makeAction({ status: 'expired', expiresAt: 1000 }));

      const result = await ActionService.getConfirmationResponse('action-1', 'token', makeEnv());

      expect(result.statusCode).toBe(200);
      expect(result.html).toContain('expired');
    });

    it('renders confirmation form for pending non-expired action', async () => {
      mockGetByTokenHash.mockResolvedValue(makeAction({ status: 'pending', expiresAt: FUTURE_EXPIRY }));

      const result = await ActionService.getConfirmationResponse('action-1', 'token', makeEnv());

      expect(result.html).toContain('<form');
      expect(result.html).toContain('Confirm action');
    });
  });

  describe('executeActionWithToken', () => {
    it('returns 404 when action not found', async () => {
      mockGetByTokenHash.mockResolvedValue(undefined);

      const result = await ActionService.executeActionWithToken(
        'action-1',
        'bad-token',
        new Request('https://example.com'),
        makeEnv(),
      );

      expect(result.statusCode).toBe(404);
    });

    it('does not re-execute an already succeeded action', async () => {
      const succeededAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(succeededAction);
      mockGetForUser.mockResolvedValue(succeededAction);

      const result = await ActionService.executeActionWithToken(
        'action-1',
        'token',
        new Request('https://example.com'),
        makeEnv(),
      );

      expect(result.statusCode).toBe(200);
      expect(mockClaimForExecution).not.toHaveBeenCalled();
    });

    it('executes manual.todo action and marks it succeeded', async () => {
      const pendingAction = makeAction();
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(pendingAction);
      mockClaimForExecution.mockResolvedValue(true);
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(doneAction);

      const result = await ActionService.executeActionWithToken(
        'action-1',
        'token',
        new Request('https://example.com'),
        makeEnv(),
      );

      expect(result.statusCode).toBe(200);
      expect(mockMarkSucceeded).toHaveBeenCalled();
    });

    it('marks action expired when expiresAt is in the past', async () => {
      const expiredAction = makeAction({ expiresAt: 1000 });
      const refreshedAction = makeAction({ status: 'expired' });
      mockGetByTokenHash.mockResolvedValue(expiredAction);
      mockMarkExpired.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(refreshedAction);

      const result = await ActionService.executeActionWithToken(
        'action-1',
        'token',
        new Request('https://example.com'),
        makeEnv(),
      );

      expect(result.statusCode).toBe(200);
      expect(mockMarkExpired).toHaveBeenCalledWith('action-1');
    });
  });

  describe('executeActionForUser', () => {
    it('throws when action is not found', async () => {
      mockGetForUser.mockResolvedValue(undefined);

      await expect(
        ActionService.executeActionForUser('action-1', 'user@example.com', new Request('https://example.com'), makeEnv() as never),
      ).rejects.toThrow('Email action was not found.');
    });

    it('executes found action and returns result', async () => {
      const action = makeAction();
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetForUser.mockResolvedValueOnce(action).mockResolvedValueOnce(doneAction);
      mockClaimForExecution.mockResolvedValue(true);
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);

      const result = await ActionService.executeActionForUser(
        'action-1',
        'user@example.com',
        new Request('https://example.com'),
        makeEnv(),
      );

      expect(result.status).toBe('succeeded');
    });
  });

  describe('createActionsForSummary', () => {
    it('returns empty array when proposals list is empty', async () => {
      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Test',
          from: 'sender@example.com',
          body: '',
          proposals: [],
          callbackBaseUrl: 'https://example.com',
        },
        makeEnv(),
      );

      expect(result).toEqual([]);
    });

    it('returns empty array when no callbackBaseUrl is configured', async () => {
      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Test',
          from: 'sender@example.com',
          body: '',
          proposals: [{ type: 'manual.todo', title: 'Do it', description: 'Now', parameters: { instructions: 'Step 1' } }],
        },
        makeEnv(),
      );

      expect(result).toEqual([]);
    });

    it('creates manual.todo action from proposal', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction());

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Meeting tomorrow',
          from: 'boss@example.com',
          body: '',
          callbackBaseUrl: 'https://example.com',
          proposals: [{ type: 'manual.todo', title: 'Prepare slides', description: 'For the meeting', parameters: { instructions: 'Make slides' } }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
      expect(result[0].token).toBe('random-token');
      expect(result[0].confirmationUrl).toContain('/api/actions/action-1');
    });

    it('creates calendar.add_event action with valid ISO dates', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'calendar.add_event' }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Team sync',
          from: 'organizer@example.com',
          body: '',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'calendar.add_event',
            title: 'Team Sync',
            description: 'Weekly standup',
            parameters: { startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z', timeZone: 'UTC' },
          }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
    });

    it('defaults calendar timeZone to the application timezone when the model omits it', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'calendar.add_event' }));

      await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail', timeZone: 'America/Los_Angeles' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Team sync',
          from: 'organizer@example.com',
          body: '',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'calendar.add_event',
            title: 'Team Sync',
            description: 'Weekly standup',
            parameters: { startTime: '2026-07-01T10:00:00', endTime: '2026-07-01T11:00:00' },
          }],
        },
        makeEnv(),
      );

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate.mock.calls[0][0].payload).toMatchObject({ type: 'calendar.add_event', timeZone: 'America/Los_Angeles' });
    });

    it('preserves an explicit model-provided timeZone over the application timezone', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'calendar.add_event' }));

      await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail', timeZone: 'America/Los_Angeles' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Team sync',
          from: 'organizer@example.com',
          body: '',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'calendar.add_event',
            title: 'Team Sync',
            description: 'Weekly standup',
            parameters: { startTime: '2026-07-01T10:00:00', endTime: '2026-07-01T11:00:00', timeZone: 'Europe/Berlin' },
          }],
        },
        makeEnv(),
      );

      expect(mockCreate.mock.calls[0][0].payload).toMatchObject({ timeZone: 'Europe/Berlin' });
    });

    it('falls back to UTC for calendar timeZone when the application has none', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'calendar.add_event' }));

      await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Team sync',
          from: 'organizer@example.com',
          body: '',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'calendar.add_event',
            title: 'Team Sync',
            description: 'Weekly standup',
            parameters: { startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z' },
          }],
        },
        makeEnv(),
      );

      expect(mockCreate.mock.calls[0][0].payload).toMatchObject({ timeZone: 'UTC' });
    });

    it('falls back to manual.todo for calendar.add_event with invalid dates', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'manual.todo' }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Meeting',
          from: 'sender@example.com',
          body: '',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'calendar.add_event',
            title: 'Broken event',
            description: 'Bad dates',
            parameters: { startTime: 'not-a-date', endTime: 'also-not-a-date' },
          }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
    });

    it('creates external.open_link action for URL found in body', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'external.open_link' }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Link email',
          from: 'sender@example.com',
          body: 'Check out https://example.com/report for details.',
          callbackBaseUrl: 'https://api.example.com',
          proposals: [{
            type: 'external.open_link',
            title: 'View report',
            description: 'See the report',
            parameters: { url: 'https://example.com/report' },
          }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
    });

    it('falls back to manual.todo for external.open_link with disallowed URL', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'manual.todo' }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Suspicious link',
          from: 'sender@example.com',
          body: 'No links here.',
          callbackBaseUrl: 'https://api.example.com',
          proposals: [{
            type: 'external.open_link',
            title: 'Visit site',
            description: 'Click here',
            parameters: { url: 'https://phishing.example.com/steal' },
          }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
    });

    it('skips proposals with unknown action type', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Test',
          from: 'sender@example.com',
          body: '',
          callbackBaseUrl: 'https://example.com',
          proposals: [{ type: 'unknown_type', title: 'Unknown', description: 'No handler', parameters: {} }],
        },
        makeEnv(),
      );

      expect(result).toEqual([]);
    });

    it('limits created actions to 4 per summary', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction());

      const proposals = Array.from({ length: 6 }, (_, i) => ({
        type: 'manual.todo' as const,
        title: `Action ${i}`,
        description: `Desc ${i}`,
        parameters: { instructions: `Do ${i}` },
      }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Many actions',
          from: 'sender@example.com',
          body: '',
          callbackBaseUrl: 'https://example.com',
          proposals,
        },
        makeEnv(),
      );

      expect(result.length).toBeLessThanOrEqual(4);
      expect(mockCreate).toHaveBeenCalledTimes(4);
    });

    it('creates email.draft_reply action', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'email.draft_reply' }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Re: Meeting',
          from: 'boss@example.com',
          body: '',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'email.draft_reply',
            title: 'Reply to meeting',
            description: 'Send a reply',
            parameters: { draftBody: 'I will be there!' },
          }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
    });

    it('creates delivery.track_package action with tracking number', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'delivery.track_package' }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Your package has shipped',
          from: 'shipping@example.com',
          body: 'Track your package at https://track.example.com/1Z999AA10123456784',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'delivery.track_package',
            title: 'Track package',
            description: 'Package shipped',
            parameters: { trackingNumber: '1Z999AA10123456784', carrier: 'UPS', trackingUrl: 'https://track.example.com/1Z999AA10123456784' },
          }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        actionType: 'delivery.track_package',
        riskLevel: 'low',
      }));
    });

    it('falls back delivery.track_package to manual.todo when tracking number is missing', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'manual.todo' }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Shipment notification',
          from: 'shipping@example.com',
          body: '',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'delivery.track_package',
            title: 'Track package',
            description: 'Package on its way',
            parameters: {},
          }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'manual.todo' }));
    });

    it('omits trackingUrl for delivery.track_package when URL is not in email body', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      let capturedPayload: unknown;
      mockCreate.mockImplementation(async (input: Record<string, unknown>) => {
        capturedPayload = input.payload;
        return makeAction({ actionType: 'delivery.track_package', payload: input.payload });
      });

      await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Package shipped',
          from: 'shipping@example.com',
          body: 'Your package 1Z999 has shipped.',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'delivery.track_package',
            title: 'Track package',
            description: 'Package shipped',
            parameters: { trackingNumber: '1Z999', trackingUrl: 'https://invented.example.com/track' },
          }],
        },
        makeEnv(),
      );

      expect((capturedPayload as Record<string, unknown>).trackingUrl).toBeUndefined();
    });

    it('creates travel.track_flight action with flight number', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'travel.track_flight' }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Your flight booking confirmation',
          from: 'airline@example.com',
          body: 'Flight AA123 departs JFK to LAX',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'travel.track_flight',
            title: 'Track flight AA123',
            description: 'Flight from JFK to LAX',
            parameters: { flightNumber: 'AA123', airline: 'American Airlines', departureAirport: 'JFK', arrivalAirport: 'LAX' },
          }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        actionType: 'travel.track_flight',
        riskLevel: 'low',
      }));
    });

    it('falls back travel.track_flight to manual.todo when flight number is missing', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'manual.todo' }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Flight confirmation',
          from: 'airline@example.com',
          body: '',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'travel.track_flight',
            title: 'Track flight',
            description: 'Your flight details',
            parameters: {},
          }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'manual.todo' }));
    });

    it('creates finance.pay_bill action with identifying info', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'finance.pay_bill' }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Invoice #1234 due',
          from: 'billing@example.com',
          body: 'Pay at https://pay.example.com/inv1234',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'finance.pay_bill',
            title: 'Pay invoice',
            description: 'Invoice due',
            parameters: { payee: 'Acme Corp', amount: '99.99', currency: 'USD', dueDate: '2026-07-01', invoiceNumber: 'INV-1234', paymentUrl: 'https://pay.example.com/inv1234' },
          }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        actionType: 'finance.pay_bill',
        riskLevel: 'medium',
      }));
    });

    it('falls back finance.pay_bill to manual.todo when no identifying info is present', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'manual.todo' }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Bill notification',
          from: 'billing@example.com',
          body: '',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'finance.pay_bill',
            title: 'Pay bill',
            description: 'A bill is due',
            parameters: {},
          }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'manual.todo' }));
    });

    it('creates appointment.confirm action and always succeeds normalization', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'appointment.confirm' }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Appointment confirmed',
          from: 'clinic@example.com',
          body: 'Your appointment is confirmed.',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'appointment.confirm',
            title: 'Appointment confirmed',
            description: 'Dentist appointment',
            parameters: { serviceType: 'Dentist', providerName: 'Dr. Smith', appointmentTime: '2026-07-15T09:00:00', location: '123 Main St', confirmationNumber: 'CONF-999' },
          }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        actionType: 'appointment.confirm',
        riskLevel: 'low',
      }));
    });

    it('creates appointment.confirm even with no parameters', async () => {
      mockDeleteByProcessedMessageId.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(makeAction({ actionType: 'appointment.confirm' }));

      const result = await ActionService.createActionsForSummary(
        {
          application: { applicationId: 'app-1', userEmail: 'user@example.com', providerId: 'google-gmail' },
          processedMessage: { processedMessageId: 'pm-1', providerMessageId: 'msg-1', providerThreadId: 'thread-1' } as never,
          subject: 'Booking confirmed',
          from: 'salon@example.com',
          body: '',
          callbackBaseUrl: 'https://example.com',
          proposals: [{
            type: 'appointment.confirm',
            title: 'Booking confirmed',
            description: 'Haircut booked',
            parameters: {},
          }],
        },
        makeEnv(),
      );

      expect(result).toHaveLength(1);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'appointment.confirm' }));
    });
  });

  describe('provider operations via executeActionWithToken', () => {
    it('executes Gmail calendar.add_event action', async () => {
      const calPayload = { type: 'calendar.add_event', eventTitle: 'Meeting', startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z', timeZone: 'UTC' };
      const action = makeAction({ actionType: 'calendar.add_event', payload: calPayload });
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(action);
      mockClaimForExecution.mockResolvedValue(true);
      mockGetById.mockResolvedValue({ applicationId: 'app-1', providerId: 'google-gmail', providerEmail: 'user@gmail.com' });
      (GmailProviderUtil.createCalendarEvent as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'evt-1', htmlLink: 'https://cal.google.com/1' });
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(doneAction);

      const result = await ActionService.executeActionWithToken('action-1', 'token', new Request('https://example.com'), makeEnv());

      expect(result.statusCode).toBe(200);
      expect(GmailProviderUtil.createCalendarEvent).toHaveBeenCalled();
    });

    it('executes Outlook calendar.add_event action', async () => {
      const calPayload = { type: 'calendar.add_event', eventTitle: 'Meeting', startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z', timeZone: 'UTC' };
      const action = makeAction({ actionType: 'calendar.add_event', providerId: 'microsoft-outlook', payload: calPayload });
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(action);
      mockClaimForExecution.mockResolvedValue(true);
      mockGetById.mockResolvedValue({ applicationId: 'app-1', providerId: 'microsoft-outlook', providerEmail: 'user@outlook.com' });
      (OutlookProviderUtil.createCalendarEvent as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'evt-2', webLink: 'https://outlook.com/2' });
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(doneAction);

      const result = await ActionService.executeActionWithToken('action-1', 'token', new Request('https://example.com'), makeEnv());

      expect(result.statusCode).toBe(200);
      expect(OutlookProviderUtil.createCalendarEvent).toHaveBeenCalled();
    });

    it('marks action as failed when provider operation throws', async () => {
      const calPayload = { type: 'calendar.add_event', eventTitle: 'Meeting', startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z', timeZone: 'UTC' };
      const action = makeAction({ actionType: 'calendar.add_event', payload: calPayload });
      const failedAction = makeAction({ status: 'failed', errorMessage: 'Calendar API error' });
      mockGetByTokenHash.mockResolvedValue(action);
      mockClaimForExecution.mockResolvedValue(true);
      mockGetById.mockResolvedValue({ applicationId: 'app-1', providerId: 'google-gmail' });
      (GmailProviderUtil.createCalendarEvent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Calendar API error'));
      mockMarkFailed.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(failedAction);

      const result = await ActionService.executeActionWithToken('action-1', 'token', new Request('https://example.com'), makeEnv());

      expect(result.statusCode).toBe(200);
      expect(mockMarkFailed).toHaveBeenCalledWith('action-1', 'Calendar API error');
    });

    it('executes delivery.track_package with trackingUrl and returns link', async () => {
      const payload = { type: 'delivery.track_package', trackingNumber: '1Z999', carrier: 'UPS', trackingUrl: 'https://track.example.com/1Z999' };
      const action = makeAction({ actionType: 'delivery.track_package', payload });
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(action);
      mockClaimForExecution.mockResolvedValue(true);
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(doneAction);

      const result = await ActionService.executeActionWithToken('action-1', 'token', new Request('https://example.com'), makeEnv());

      expect(result.statusCode).toBe(200);
      expect(mockMarkSucceeded).toHaveBeenCalledWith('action-1', expect.objectContaining({
        summary: 'Package tracking link opened.',
        externalUrl: 'https://track.example.com/1Z999',
      }));
    });

    it('executes delivery.track_package without trackingUrl and acknowledges with tracking number', async () => {
      const payload = { type: 'delivery.track_package', trackingNumber: '1Z999', carrier: 'UPS' };
      const action = makeAction({ actionType: 'delivery.track_package', payload });
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(action);
      mockClaimForExecution.mockResolvedValue(true);
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(doneAction);

      await ActionService.executeActionWithToken('action-1', 'token', new Request('https://example.com'), makeEnv());

      expect(mockMarkSucceeded).toHaveBeenCalledWith('action-1', expect.objectContaining({
        summary: 'Package tracking noted: 1Z999 via UPS.',
      }));
    });

    it('executes delivery.track_package with Aftership API key and returns live status', async () => {
      const { ConfigurationManager } = await import('@mail-otter/backend-runtime/config');
      (ConfigurationManager.digest.getPackageTrackingApiKey as ReturnType<typeof vi.fn>).mockReturnValue('aftership-key');
      mockFetchStatus.mockResolvedValue({ summary: 'In Transit — In transit, Louisville, KY' });

      const payload = { type: 'delivery.track_package', trackingNumber: '1Z999', carrier: 'UPS', trackingUrl: 'https://track.example.com/1Z999' };
      const action = makeAction({ actionType: 'delivery.track_package', payload });
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(action);
      mockClaimForExecution.mockResolvedValue(true);
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(doneAction);

      await ActionService.executeActionWithToken('action-1', 'token', new Request('https://example.com'), makeEnv());

      expect(mockFetchStatus).toHaveBeenCalledWith('1Z999', 'UPS', 'aftership-key');
      expect(mockMarkSucceeded).toHaveBeenCalledWith('action-1', expect.objectContaining({
        summary: 'In Transit — In transit, Louisville, KY',
        externalUrl: 'https://track.example.com/1Z999',
      }));
    });

    it('falls back to static behavior when Aftership API returns null', async () => {
      const { ConfigurationManager } = await import('@mail-otter/backend-runtime/config');
      (ConfigurationManager.digest.getPackageTrackingApiKey as ReturnType<typeof vi.fn>).mockReturnValue('aftership-key');
      mockFetchStatus.mockResolvedValue(null);

      const payload = { type: 'delivery.track_package', trackingNumber: '1Z999', carrier: 'UPS', trackingUrl: 'https://track.example.com/1Z999' };
      const action = makeAction({ actionType: 'delivery.track_package', payload });
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(action);
      mockClaimForExecution.mockResolvedValue(true);
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(doneAction);

      await ActionService.executeActionWithToken('action-1', 'token', new Request('https://example.com'), makeEnv());

      expect(mockMarkSucceeded).toHaveBeenCalledWith('action-1', expect.objectContaining({
        summary: 'Package tracking link opened.',
        externalUrl: 'https://track.example.com/1Z999',
      }));
    });

    it('executes travel.track_flight without API key and returns static acknowledgment', async () => {
      const payload = { type: 'travel.track_flight', flightNumber: 'AA123', airline: 'American Airlines' };
      const action = makeAction({ actionType: 'travel.track_flight', payload });
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(action);
      mockClaimForExecution.mockResolvedValue(true);
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(doneAction);

      await ActionService.executeActionWithToken('action-1', 'token', new Request('https://example.com'), makeEnv());

      expect(mockFetchFlightStatus).not.toHaveBeenCalled();
      expect(mockMarkSucceeded).toHaveBeenCalledWith('action-1', expect.objectContaining({
        summary: 'Flight AA123 details noted.',
      }));
    });

    it('executes travel.track_flight with API key and returns live status summary', async () => {
      const { ConfigurationManager } = await import('@mail-otter/backend-runtime/config');
      (ConfigurationManager.digest.getFlightTrackingApiKey as ReturnType<typeof vi.fn>).mockReturnValue('aviationstack-key');
      const syncStatus = { flightNumber: 'AA123', status: 'scheduled', departureTime: '2026-07-01T14:30:00+00:00', departureIata: 'JFK', arrivalIata: 'LAX' };
      mockFetchFlightStatus.mockResolvedValue(syncStatus);
      mockFormatFlightSummary.mockReturnValue('Flight AA123 — Scheduled · Departs 14:30 UTC');
      mockUpdateSyncStatus.mockResolvedValue(undefined);

      const payload = { type: 'travel.track_flight', flightNumber: 'AA123', airline: 'American Airlines', trackingUrl: 'https://track.example.com/AA123' };
      const action = makeAction({ actionType: 'travel.track_flight', payload });
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(action);
      mockClaimForExecution.mockResolvedValue(true);
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(doneAction);

      await ActionService.executeActionWithToken('action-1', 'token', new Request('https://example.com'), makeEnv());

      expect(mockFetchFlightStatus).toHaveBeenCalledWith('AA123', 'aviationstack-key');
      expect(mockUpdateSyncStatus).toHaveBeenCalledWith('action-1', expect.stringContaining('scheduled'));
      expect(mockMarkSucceeded).toHaveBeenCalledWith('action-1', expect.objectContaining({
        summary: 'Flight AA123 — Scheduled · Departs 14:30 UTC',
        externalUrl: 'https://track.example.com/AA123',
      }));
    });

    it('falls back to static behavior when flight API returns null', async () => {
      const { ConfigurationManager } = await import('@mail-otter/backend-runtime/config');
      (ConfigurationManager.digest.getFlightTrackingApiKey as ReturnType<typeof vi.fn>).mockReturnValue('aviationstack-key');
      mockFetchFlightStatus.mockResolvedValue(null);

      const payload = { type: 'travel.track_flight', flightNumber: 'AA123', trackingUrl: 'https://track.example.com/AA123' };
      const action = makeAction({ actionType: 'travel.track_flight', payload });
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(action);
      mockClaimForExecution.mockResolvedValue(true);
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(doneAction);

      await ActionService.executeActionWithToken('action-1', 'token', new Request('https://example.com'), makeEnv());

      expect(mockUpdateSyncStatus).not.toHaveBeenCalled();
      expect(mockMarkSucceeded).toHaveBeenCalledWith('action-1', expect.objectContaining({
        summary: 'Flight tracking link opened.',
        externalUrl: 'https://track.example.com/AA123',
      }));
    });

    it('executes finance.pay_bill with paymentUrl and returns link', async () => {
      const payload = { type: 'finance.pay_bill', payee: 'Acme Corp', amount: '99.99', paymentUrl: 'https://pay.example.com/inv1' };
      const action = makeAction({ actionType: 'finance.pay_bill', riskLevel: 'medium', payload });
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(action);
      mockClaimForExecution.mockResolvedValue(true);
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(doneAction);

      await ActionService.executeActionWithToken('action-1', 'token', new Request('https://example.com'), makeEnv());

      expect(mockMarkSucceeded).toHaveBeenCalledWith('action-1', expect.objectContaining({
        summary: 'Payment link opened.',
        externalUrl: 'https://pay.example.com/inv1',
      }));
    });

    it('executes finance.pay_bill without paymentUrl and acknowledges reminder', async () => {
      const payload = { type: 'finance.pay_bill', payee: 'Acme Corp', dueDate: '2026-07-01' };
      const action = makeAction({ actionType: 'finance.pay_bill', riskLevel: 'medium', payload });
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(action);
      mockClaimForExecution.mockResolvedValue(true);
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(doneAction);

      await ActionService.executeActionWithToken('action-1', 'token', new Request('https://example.com'), makeEnv());

      expect(mockMarkSucceeded).toHaveBeenCalledWith('action-1', expect.objectContaining({
        summary: 'Bill payment reminder noted.',
      }));
    });

    it('executes appointment.confirm and acknowledges details', async () => {
      const payload = { type: 'appointment.confirm', serviceType: 'Dentist', providerName: 'Dr. Smith', appointmentTime: '2026-07-15T09:00:00' };
      const action = makeAction({ actionType: 'appointment.confirm', payload });
      const doneAction = makeAction({ status: 'succeeded' });
      mockGetByTokenHash.mockResolvedValue(action);
      mockClaimForExecution.mockResolvedValue(true);
      mockMarkSucceeded.mockResolvedValue(undefined);
      mockRecordExecution.mockResolvedValue(undefined);
      mockGetForUser.mockResolvedValue(doneAction);

      await ActionService.executeActionWithToken('action-1', 'token', new Request('https://example.com'), makeEnv());

      expect(mockMarkSucceeded).toHaveBeenCalledWith('action-1', expect.objectContaining({
        summary: 'Appointment on 2026-07-15T09:00:00 details noted.',
      }));
    });
  });
});
