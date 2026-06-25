import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRun = vi.fn();
const mockFirst = vi.fn();
const mockAll = vi.fn();

vi.mock('@mail-otter/shared/utils', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('@mail-otter/shared/utils');
  return {
    ...actual,
    UUIDUtil: {
      ...actual.UUIDUtil,
      getRandomUUID: () => 'mock-sub-uuid',
    },
  };
});

import { ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';

function createMockDb(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: mockRun,
        first: mockFirst,
        all: mockAll,
      })),
    })),
    batch: vi.fn(),
  };
}

describe('ProviderSubscriptionDAO', () => {
  let dao: ProviderSubscriptionDAO;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockRun.mockReset().mockResolvedValue({ success: true });
    mockFirst.mockReset();
    mockAll.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    dao = new ProviderSubscriptionDAO(createMockDb());
  });

  describe('getByApplication', () => {
    it('returns subscription when found', async () => {
      mockFirst.mockResolvedValue({
        subscription_id: 'sub-1',
        application_id: 'app-1',
        provider_id: 'google-gmail',
        external_subscription_id: 'ext-1',
        webhook_secret_hash: 'hash',
        client_state_hash: null,
        gmail_history_id: 'hist-1',
        resource: null,
        status: 'active',
        expires_at: 9_999_999_999,
        last_notification_at: null,
        last_renewed_at: 1000,
        last_error: null,
        renewal_retry_count: 0,
        renewal_next_retry_at: null,
        created_at: 500,
        updated_at: 1000,
      });

      const sub = await dao.getByApplication('app-1');

      expect(sub).toBeDefined();
      expect(sub!.applicationId).toBe('app-1');
      expect(sub!.status).toBe('active');
    });

    it('returns undefined when not found', async () => {
      mockFirst.mockResolvedValue(null);

      const sub = await dao.getByApplication('app-1');

      expect(sub).toBeUndefined();
    });
  });

  describe('getByExternalSubscriptionId', () => {
    it('returns subscription when found', async () => {
      mockFirst.mockResolvedValue({
        subscription_id: 'sub-1',
        application_id: 'app-1',
        provider_id: 'microsoft-outlook',
        external_subscription_id: 'ext-outlook-1',
        webhook_secret_hash: null,
        client_state_hash: 'client-state',
        gmail_history_id: null,
        resource: 'Users/test/MailFolders/Inbox',
        status: 'active',
        expires_at: 9_999_999_999,
        last_notification_at: null,
        last_renewed_at: 1000,
        last_error: null,
        renewal_retry_count: 0,
        renewal_next_retry_at: null,
        created_at: 500,
        updated_at: 1000,
      });

      const sub = await dao.getByExternalSubscriptionId('ext-outlook-1');

      expect(sub).toBeDefined();
      expect(sub!.externalSubscriptionId).toBe('ext-outlook-1');
    });
  });

  describe('upsertActive', () => {
    it('creates a new subscription when none exists', async () => {
      mockFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          subscription_id: 'mock-sub-uuid',
          application_id: 'app-1',
          provider_id: 'google-gmail',
          external_subscription_id: 'ext-1',
          webhook_secret_hash: 'hash-1',
          client_state_hash: null,
          gmail_history_id: 'hist-1',
          resource: null,
          status: 'active',
          expires_at: 9_999_999_999,
          last_notification_at: null,
          last_renewed_at: 1000,
          last_error: null,
          renewal_retry_count: 0,
          renewal_next_retry_at: null,
          created_at: 500,
          updated_at: 1000,
        });

      const sub = await dao.upsertActive({
        applicationId: 'app-1',
        providerId: 'google-gmail',
        externalSubscriptionId: 'ext-1',
        webhookSecretHash: 'hash-1',
        gmailHistoryId: 'hist-1',
        expiresAt: 9_999_999_999,
      });

      expect(sub).toBeDefined();
      expect(sub.subscriptionId).toBe('mock-sub-uuid');
    });

    it('updates existing subscription', async () => {
      mockFirst
        .mockResolvedValueOnce({
          subscription_id: 'existing-sub',
          application_id: 'app-1',
          provider_id: 'google-gmail',
          external_subscription_id: 'ext-old',
          webhook_secret_hash: 'old-hash',
          client_state_hash: null,
          gmail_history_id: 'old-hist',
          resource: null,
          status: 'active',
          expires_at: 1000,
          last_notification_at: null,
          last_renewed_at: 500,
          last_error: null,
          renewal_retry_count: 0,
          renewal_next_retry_at: null,
          created_at: 100,
          updated_at: 500,
        })
        .mockResolvedValueOnce({
          subscription_id: 'existing-sub',
          application_id: 'app-1',
          provider_id: 'google-gmail',
          external_subscription_id: 'ext-new',
          webhook_secret_hash: 'old-hash',
          client_state_hash: null,
          gmail_history_id: 'old-hist',
          resource: null,
          status: 'active',
          expires_at: 9_999_999_999,
          last_notification_at: null,
          last_renewed_at: 1000,
          last_error: null,
          renewal_retry_count: 0,
          renewal_next_retry_at: null,
          created_at: 100,
          updated_at: 1000,
        });

      const sub = await dao.upsertActive({
        applicationId: 'app-1',
        providerId: 'google-gmail',
        externalSubscriptionId: 'ext-new',
        expiresAt: 9_999_999_999,
      });

      expect(sub.subscriptionId).toBe('existing-sub');
      expect(sub.externalSubscriptionId).toBe('ext-new');
    });
  });

  describe('markStopped', () => {
    it('updates status to stopped', async () => {
      await dao.markStopped('app-1');
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe('markError', () => {
    it('updates status to error with message', async () => {
      await dao.markError('sub-1', 'Something went wrong');
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe('touchNotification', () => {
    it('updates notification timestamp', async () => {
      await dao.touchNotification('sub-1');
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe('updateGmailHistory', () => {
    it('updates gmail history id', async () => {
      await dao.updateGmailHistory('sub-1', 'new-history-id');
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe('listActiveRenewalCandidates', () => {
    it('returns empty array when no candidates', async () => {
      mockAll.mockResolvedValue({ results: [] });

      const candidates = await dao.listActiveRenewalCandidates(1000, 2000);

      expect(candidates).toEqual([]);
    });
  });

  describe('recordTransientError', () => {
    it('updates error count and next retry', async () => {
      await dao.recordTransientError('sub-1', 'Transient issue', 9_999_999_999);
      expect(mockRun).toHaveBeenCalled();
    });
  });
});
