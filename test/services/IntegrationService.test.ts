import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockListEnabled,
  mockGetDecryptedWebhookUrl,
  mockLogCreate,
  mockCountByApplicationId,
} = vi.hoisted(() => ({
  mockListEnabled: vi.fn(),
  mockGetDecryptedWebhookUrl: vi.fn(),
  mockLogCreate: vi.fn(),
  mockCountByApplicationId: vi.fn().mockResolvedValue(0),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ApplicationIntegrationDAO: vi.fn(function () {
    return {
      listEnabled: mockListEnabled,
      getDecryptedWebhookUrl: mockGetDecryptedWebhookUrl,
      countByApplicationId: mockCountByApplicationId,
    };
  }),
  IntegrationDeliveryLogDAO: vi.fn(function () {
    return { create: mockLogCreate };
  }),
}));

import { IntegrationService } from '@mail-otter/backend-services/integration';

function makeEnv() {
  return {
    DB: {} as D1Database,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master-key') } as unknown as SecretsStoreSecret,
  };
}

function makeSummaryData(overrides?: Record<string, unknown>) {
  return {
    application: { applicationId: 'app-1' },
    emailSubject: 'Order Confirmed',
    emailFrom: 'shop@example.com',
    rawSummary: {
      gist: 'Your order has been confirmed.',
      keyDetails: ['Order #12345', 'Ships in 3-5 days'],
    },
    actions: [
      {
        action: {
          actionType: 'delivery.track_package',
          title: 'Track Package',
          description: 'Track your shipment.',
          riskLevel: 'low',
        },
        confirmationUrl: 'https://app.example.com/actions/abc123',
      },
    ],
    ...overrides,
  };
}

function makeIntegration(type: 'slack' | 'discord' | 'webhook', overrides?: Record<string, unknown>) {
  return {
    integrationId: `integ-${type}`,
    applicationId: 'app-1',
    integrationType: type,
    name: `${type} Integration`,
    maskedWebhookUrl: 'https://hooks.example.com/...',
    enabled: true,
    createdAt: 1_778_200_000,
    updatedAt: 1_778_200_000,
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

describe('IntegrationService', () => {
  let service: IntegrationService;
  let env: ReturnType<typeof makeEnv>;

  beforeEach(() => {
    vi.clearAllMocks();
    env = makeEnv();
    service = new IntegrationService(env);
    mockGetDecryptedWebhookUrl.mockResolvedValue('https://hooks.example.com/webhook/secret');
    mockLogCreate.mockResolvedValue({});
  });

  describe('sendToIntegrations', () => {
    it('returns early when no integrations are enabled', async () => {
      mockListEnabled.mockResolvedValue([]);
      const summaryData = makeSummaryData();

      await service.sendToIntegrations(summaryData as any);

      expect(mockGetDecryptedWebhookUrl).not.toHaveBeenCalled();
      expect(mockLogCreate).not.toHaveBeenCalled();
    });

    it('dispatches to webhook integration successfully', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('webhook')]);
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = fetchMock;

      await service.sendToIntegrations(makeSummaryData() as any);

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(mockLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success', httpStatus: 200 }),
      );
    });

    it('dispatches to slack integration successfully', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('slack')]);
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = fetchMock;

      await service.sendToIntegrations(makeSummaryData() as any);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://hooks.example.com/webhook/secret');
      const body = JSON.parse(options.body as string);
      expect(body).toHaveProperty('blocks');
      expect(mockLogCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    });

    it('dispatches to discord integration successfully', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('discord')]);
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
      global.fetch = fetchMock;

      await service.sendToIntegrations(makeSummaryData() as any);

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body).toHaveProperty('embeds');
    });

    it('records failure when HTTP returns non-OK', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('webhook')]);
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });

      await service.sendToIntegrations(makeSummaryData() as any);

      expect(mockLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failure', httpStatus: 503 }),
      );
    });

    it('records failure when fetch throws network error', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('webhook')]);
      global.fetch = vi.fn().mockRejectedValue(new Error('Network unreachable'));

      await service.sendToIntegrations(makeSummaryData() as any);

      expect(mockLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failure', errorMessage: expect.stringContaining('Network unreachable') }),
      );
    });

    it('records failure when getDecryptedWebhookUrl throws', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('webhook')]);
      mockGetDecryptedWebhookUrl.mockRejectedValue(new Error('Key not found'));

      await service.sendToIntegrations(makeSummaryData() as any);

      expect(mockLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failure', errorMessage: expect.stringContaining('Key not found') }),
      );
    });

    it('continues processing other integrations when one fails', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('slack'), makeIntegration('webhook')]);
      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Slack down'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      await service.sendToIntegrations(makeSummaryData() as any);

      expect(mockLogCreate).toHaveBeenCalledTimes(2);
    });

    it('does not throw when log DAO creation fails', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('webhook')]);
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      mockLogCreate.mockRejectedValue(new Error('DB error'));

      await expect(service.sendToIntegrations(makeSummaryData() as any)).resolves.toBeUndefined();
    });

    it('builds slack payload with key details and actions', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('slack')]);
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = fetchMock;

      await service.sendToIntegrations(makeSummaryData() as any);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      const blockTypes = (body.blocks as Array<{ type: string }>).map((b) => b.type);
      expect(blockTypes).toContain('header');
      expect(blockTypes).toContain('section');
      expect(blockTypes).toContain('context');
    });

    it('builds webhook payload with structured data', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('webhook')]);
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = fetchMock;

      await service.sendToIntegrations(makeSummaryData() as any);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.event).toBe('email.processed');
      expect(body.email.subject).toBe('Order Confirmed');
      expect(body.summary.gist).toBe('Your order has been confirmed.');
      expect(body.actions).toHaveLength(1);
    });

    it('truncates emailSubject to 255 chars when creating log', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('webhook')]);
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      const longSubject = 'A'.repeat(300);

      await service.sendToIntegrations(makeSummaryData({ emailSubject: longSubject }) as any);

      expect(mockLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({ emailSubject: 'A'.repeat(255) }),
      );
    });
  });

  describe('sendTestNotification', () => {
    it('dispatches test notification successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      const integration = makeIntegration('webhook');

      await service.sendTestNotification(integration as any);

      expect(global.fetch).toHaveBeenCalled();
    });

    it('throws when integration returns non-OK response', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });

      await expect(service.sendTestNotification(makeIntegration('webhook') as any)).rejects.toThrow('HTTP 401');
    });

    it('throws when fetch throws', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      await expect(service.sendTestNotification(makeIntegration('slack') as any)).rejects.toThrow('Connection refused');
    });
  });
});
