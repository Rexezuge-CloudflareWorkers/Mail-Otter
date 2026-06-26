import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNow = 1_778_200_000;
const mockUUID = 'integ-uuid-1';
const mockEncrypted = { encrypted: 'enc-url', iv: 'url-iv' };

vi.mock('@mail-otter/backend-data/crypto', () => ({
  encryptData: vi.fn(() => Promise.resolve(mockEncrypted)),
  decryptData: vi.fn(() => Promise.resolve('https://hooks.example.com/webhook/abcdefg')),
}));

vi.mock('@mail-otter/shared/utils', () => ({
  TimestampUtil: { getCurrentUnixTimestampInSeconds: vi.fn(() => mockNow) },
  UUIDUtil: { getRandomUUID: vi.fn(() => mockUUID) },
}));

import { ApplicationIntegrationDAO } from '@mail-otter/backend-data/dao';
import { BadRequestError } from '@mail-otter/backend-errors';

const WEBHOOK_URL = 'https://hooks.example.com/webhook/abcdefg-long-suffix';
const MASKED_URL = WEBHOOK_URL.slice(0, 30);

function makeDb(overrides?: { firstResult?: unknown; allResults?: unknown[]; countResult?: { cnt: number }; runMeta?: { changes: number } }): D1Database {
  const runFn = vi.fn().mockResolvedValue({ success: true, meta: overrides?.runMeta ?? { changes: 1 } });
  const firstFn = vi.fn().mockResolvedValue(overrides?.firstResult ?? null);
  const allFn = vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] });
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({ run: runFn, first: firstFn, all: allFn })),
    })),
  };
}

function makeIntegrationRow(overrides?: Record<string, unknown>) {
  return {
    integration_id: mockUUID,
    application_id: 'app-1',
    integration_type: 'webhook',
    name: 'My Integration',
    encrypted_webhook_url: mockEncrypted.encrypted,
    webhook_url_iv: mockEncrypted.iv,
    webhook_url_prefix: MASKED_URL,
    enabled: 1,
    created_at: mockNow,
    updated_at: mockNow,
    last_delivery_at: null,
    last_delivery_status: null,
    consecutive_failures: 0,
    ...overrides,
  };
}

describe('ApplicationIntegrationDAO', () => {
  let dao: ApplicationIntegrationDAO;
  let db: D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDb();
    dao = new ApplicationIntegrationDAO(db, 'master-key');
  });

  describe('create', () => {
    it('inserts integration and returns public view', async () => {
      // first() call for countByApplicationId returns 0
      const firstFn = vi.fn().mockResolvedValueOnce({ cnt: 0 }).mockResolvedValueOnce(null);
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ first: firstFn, run: runFn, all: vi.fn().mockResolvedValue({ results: [] }) }),
          ),
        })),
      };
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      const result = await dao.create('app-1', 'webhook', 'My Integration', WEBHOOK_URL);

      expect(result.integrationId).toBe(mockUUID);
      expect(result.applicationId).toBe('app-1');
      expect(result.integrationType).toBe('webhook');
      expect(result.name).toBe('My Integration');
      expect(result.maskedWebhookUrl).toContain('...');
      expect(result.enabled).toBe(true);
      expect(result.createdAt).toBe(mockNow);
    });

    it('throws BadRequestError when max integrations reached', async () => {
      const firstFn = vi.fn().mockResolvedValue({ cnt: 5 });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ first: firstFn })),
        })),
      };
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      await expect(dao.create('app-1', 'webhook', 'Extra', WEBHOOK_URL)).rejects.toThrow(BadRequestError);
    });
  });

  describe('listByApplicationId', () => {
    it('returns mapped integrations', async () => {
      const row = makeIntegrationRow();
      db = makeDb({ allResults: [row] });
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      const results = await dao.listByApplicationId('app-1');
      expect(results).toHaveLength(1);
      expect(results[0].integrationId).toBe(mockUUID);
      expect(results[0].maskedWebhookUrl).toBe(`${MASKED_URL}...`);
    });

    it('returns empty array when no integrations', async () => {
      const results = await dao.listByApplicationId('app-1');
      expect(results).toHaveLength(0);
    });
  });

  describe('listEnabled', () => {
    it('returns only enabled integrations', async () => {
      const row = makeIntegrationRow({ enabled: 1 });
      db = makeDb({ allResults: [row] });
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      const results = await dao.listEnabled('app-1');
      expect(results).toHaveLength(1);
      expect(results[0].enabled).toBe(true);
    });
  });

  describe('getByIdForUser', () => {
    it('returns integration when found', async () => {
      const row = makeIntegrationRow();
      db = makeDb({ firstResult: row });
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      const result = await dao.getByIdForUser(mockUUID, 'user@example.com');
      expect(result?.integrationId).toBe(mockUUID);
    });

    it('returns null when not found', async () => {
      const result = await dao.getByIdForUser('no-such-id', 'user@example.com');
      expect(result).toBeNull();
    });
  });

  describe('getApplicationIdForUser', () => {
    it('returns applicationId when found', async () => {
      db = makeDb({ firstResult: { application_id: 'app-1' } });
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      const result = await dao.getApplicationIdForUser(mockUUID, 'user@example.com');
      expect(result).toBe('app-1');
    });

    it('returns null when not found', async () => {
      const result = await dao.getApplicationIdForUser('no-such-id', 'user@example.com');
      expect(result).toBeNull();
    });
  });

  describe('getDecryptedWebhookUrl', () => {
    it('returns decrypted URL', async () => {
      db = makeDb({ firstResult: { encrypted_webhook_url: mockEncrypted.encrypted, webhook_url_iv: mockEncrypted.iv } });
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      const url = await dao.getDecryptedWebhookUrl(mockUUID);
      expect(url).toBe('https://hooks.example.com/webhook/abcdefg');
    });

    it('throws BadRequestError when integration not found', async () => {
      await expect(dao.getDecryptedWebhookUrl('no-such-id')).rejects.toThrow(BadRequestError);
    });
  });

  describe('update', () => {
    it('updates name and returns updated integration', async () => {
      const updatedRow = makeIntegrationRow({ name: 'Updated Name' });
      const firstFn = vi.fn().mockResolvedValue(updatedRow);
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ first: firstFn, run: runFn, all: vi.fn().mockResolvedValue({ results: [] }) })),
        })),
      };
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      const result = await dao.update(mockUUID, { name: 'Updated Name' });
      expect(result.name).toBe('Updated Name');
    });

    it('updates enabled state', async () => {
      const updatedRow = makeIntegrationRow({ enabled: 0 });
      const firstFn = vi.fn().mockResolvedValue(updatedRow);
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ first: firstFn, run: runFn, all: vi.fn().mockResolvedValue({ results: [] }) })),
        })),
      };
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      const result = await dao.update(mockUUID, { enabled: false });
      expect(result.enabled).toBe(false);
    });

    it('updates webhook URL with re-encryption', async () => {
      const updatedRow = makeIntegrationRow({ webhook_url_prefix: 'https://new-hook.example.com/' });
      const firstFn = vi.fn().mockResolvedValue(updatedRow);
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ first: firstFn, run: runFn, all: vi.fn().mockResolvedValue({ results: [] }) })),
        })),
      };
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      await dao.update(mockUUID, { webhookUrl: 'https://new-hook.example.com/abc' });
      expect(runFn).toHaveBeenCalled();
    });

    it('throws BadRequestError when integration not found after update', async () => {
      const firstFn = vi.fn().mockResolvedValue(null);
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ first: firstFn, run: runFn })),
        })),
      };
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      await expect(dao.update(mockUUID, { name: 'X' })).rejects.toThrow(BadRequestError);
    });
  });

  describe('deleteById', () => {
    it('executes delete query', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ run: runFn })),
        })),
      };
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      await dao.deleteById(mockUUID);
      expect(runFn).toHaveBeenCalled();
    });
  });

  describe('countByApplicationId', () => {
    it('returns count from database', async () => {
      db = makeDb({ firstResult: { cnt: 3 } });
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      const count = await dao.countByApplicationId('app-1');
      expect(count).toBe(3);
    });

    it('returns 0 when no integrations exist', async () => {
      const count = await dao.countByApplicationId('app-empty');
      expect(count).toBe(0);
    });
  });

  describe('toPublic (masking)', () => {
    it('produces masked URL with ellipsis', async () => {
      const row = makeIntegrationRow({ webhook_url_prefix: 'https://hooks.example.com/abc' });
      db = makeDb({ allResults: [row] });
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      const results = await dao.listByApplicationId('app-1');
      expect(results[0].maskedWebhookUrl).toBe('https://hooks.example.com/abc...');
    });

    it('returns empty string for null webhook_url_prefix', async () => {
      const row = makeIntegrationRow({ webhook_url_prefix: null });
      db = makeDb({ allResults: [row] });
      dao = new ApplicationIntegrationDAO(db, 'master-key');

      const results = await dao.listByApplicationId('app-1');
      expect(results[0].maskedWebhookUrl).toBe('');
    });
  });
});
