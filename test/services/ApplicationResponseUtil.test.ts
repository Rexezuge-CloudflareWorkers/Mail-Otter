import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetByApplication, mockGetLatestForApplication, mockGetLatestErrorForApplication, mockGetSummaryByApplication } = vi.hoisted(
  () => ({
    mockGetByApplication: vi.fn(),
    mockGetLatestForApplication: vi.fn(),
    mockGetLatestErrorForApplication: vi.fn(),
    mockGetSummaryByApplication: vi.fn(),
  }),
);

vi.mock('@mail-otter/backend-data/dao', () => ({
  ProviderSubscriptionDAO: vi.fn(function () {
    return { getByApplication: mockGetByApplication };
  }),
  ProcessedMessageDAO: vi.fn(function () {
    return {
      getLatestForApplication: mockGetLatestForApplication,
      getLatestErrorForApplication: mockGetLatestErrorForApplication,
    };
  }),
  ApplicationContextDAO: vi.fn(function () {
    return { getSummaryByApplication: mockGetSummaryByApplication };
  }),
}));

vi.mock('@mail-otter/shared/utils', () => ({
  BaseUrlUtil: {
    getBaseUrl: vi.fn(() => 'https://example.com'),
  },
}));

import { ApplicationResponseUtil } from '../../packages/backend-services/src/application/ApplicationResponseUtil';

function makeApplication(overrides?: Record<string, unknown>) {
  return {
    applicationId: 'app-1',
    userEmail: 'user@example.com',
    providerId: 'google-gmail',
    displayName: 'My App',
    ...overrides,
  };
}

function makeEnv() {
  return { DB: {} as D1Database };
}

function makeContextSummary(overrides?: Record<string, unknown>) {
  return {
    documentCount: 0,
    lastIndexedAt: null,
    lastDeleteAcceptedAt: null,
    lastError: null,
    lastErrorAt: null,
    ...overrides,
  };
}

describe('ApplicationResponseUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByApplication.mockResolvedValue(undefined);
    mockGetLatestForApplication.mockResolvedValue(undefined);
    mockGetLatestErrorForApplication.mockResolvedValue(undefined);
    mockGetSummaryByApplication.mockResolvedValue(makeContextSummary());
  });

  describe('decorateApplication', () => {
    it('returns correct OAuth2 redirect URI', async () => {
      const result = await ApplicationResponseUtil.decorateApplication(
        makeApplication(),
        makeEnv(),
        new Request('https://example.com'),
      );

      expect(result.oauth2RedirectUri).toBe('https://example.com/api/oauth2/callback/app-1');
    });

    it('returns Gmail webhook URL without token when no subscription', async () => {
      const result = await ApplicationResponseUtil.decorateApplication(
        makeApplication(),
        makeEnv(),
        new Request('https://example.com'),
      );

      expect(result.webhookUrl).toBe('https://example.com/api/webhooks/gmail/app-1');
    });

    it('returns Outlook webhook URL for microsoft-outlook provider', async () => {
      const result = await ApplicationResponseUtil.decorateApplication(
        makeApplication({ providerId: 'microsoft-outlook' }),
        makeEnv(),
        new Request('https://example.com'),
      );

      expect(result.webhookUrl).toBe('https://example.com/api/webhooks/outlook/app-1');
    });

    it('appends token query param when subscription has webhookSecretHash', async () => {
      mockGetByApplication.mockResolvedValue({ webhookSecretHash: 'hashed-secret', status: 'active', expiresAt: 9999 });

      const result = await ApplicationResponseUtil.decorateApplication(
        makeApplication(),
        makeEnv(),
        new Request('https://example.com'),
      );

      expect(result.webhookUrl).toContain('?token=shown-on-watch-start');
    });

    it('includes watchStatus and watchExpiresAt from subscription', async () => {
      mockGetByApplication.mockResolvedValue({ status: 'active', expiresAt: 1_234_567 });

      const result = await ApplicationResponseUtil.decorateApplication(
        makeApplication(),
        makeEnv(),
        new Request('https://example.com'),
      );

      expect(result.watchStatus).toBe('active');
      expect(result.watchExpiresAt).toBe(1_234_567);
    });

    it('includes lastSummaryAt from latest processed message', async () => {
      mockGetLatestForApplication.mockResolvedValue({ summarySentAt: 9_876_543 });

      const result = await ApplicationResponseUtil.decorateApplication(
        makeApplication(),
        makeEnv(),
        new Request('https://example.com'),
      );

      expect(result.lastSummaryAt).toBe(9_876_543);
    });

    it('uses subscription lastError over processed message error', async () => {
      mockGetByApplication.mockResolvedValue({ lastError: 'Watch expired', updatedAt: 111 });
      mockGetLatestErrorForApplication.mockResolvedValue({ errorMessage: 'Processing failed', updatedAt: 222 });

      const result = await ApplicationResponseUtil.decorateApplication(
        makeApplication(),
        makeEnv(),
        new Request('https://example.com'),
      );

      expect(result.lastError).toBe('Watch expired');
      expect(result.lastErrorAt).toBe(111);
    });

    it('falls back to processed message error when subscription has no lastError', async () => {
      mockGetLatestErrorForApplication.mockResolvedValue({ errorMessage: 'Processing failed', updatedAt: 333 });

      const result = await ApplicationResponseUtil.decorateApplication(
        makeApplication(),
        makeEnv(),
        new Request('https://example.com'),
      );

      expect(result.lastError).toBe('Processing failed');
      expect(result.lastErrorAt).toBe(333);
    });

    it('includes context document count and timestamps', async () => {
      mockGetSummaryByApplication.mockResolvedValue(makeContextSummary({ documentCount: 7, lastIndexedAt: 555, lastDeleteAcceptedAt: 444 }));

      const result = await ApplicationResponseUtil.decorateApplication(
        makeApplication(),
        makeEnv(),
        new Request('https://example.com'),
      );

      expect(result.contextDocumentCount).toBe(7);
      expect(result.contextLastIndexedAt).toBe(555);
      expect(result.contextLastDeleteAcceptedAt).toBe(444);
    });

    it('includes context error info from summary', async () => {
      mockGetSummaryByApplication.mockResolvedValue(makeContextSummary({ lastError: 'Index error', lastErrorAt: 999 }));

      const result = await ApplicationResponseUtil.decorateApplication(
        makeApplication(),
        makeEnv(),
        new Request('https://example.com'),
      );

      expect(result.contextLastError).toBe('Index error');
      expect(result.contextLastErrorAt).toBe(999);
    });
  });
});
