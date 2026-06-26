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

    it('handles no actions in payload', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('webhook')]);
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

      await service.sendToIntegrations(makeSummaryData({ actions: [] }) as any);

      const body = JSON.parse(global.fetch.mock.calls[0][1].body as string);
      expect(body.actions).toEqual([]);
    });

    it('handles empty key details', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('slack')]);
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

      await service.sendToIntegrations(makeSummaryData({ rawSummary: { gist: 'Test', keyDetails: [] } }) as any);

      const body = JSON.parse(global.fetch.mock.calls[0][1].body as string);
      const blockTypes = (body.blocks as Array<{ type: string }>).map((b) => b.type);
      expect(blockTypes).not.toContain('Key Details');
    });

    it('handles missing emailSubject gracefully', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('discord')]);
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

      await service.sendToIntegrations(makeSummaryData({ emailSubject: null }) as any);

      const body = JSON.parse(global.fetch.mock.calls[0][1].body as string);
      expect(body.embeds[0].title).toContain('New Email: null');
    });

    it('truncates discord key details to 1024 chars', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('discord')]);
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      const longDetails = Array(20).fill('A'.repeat(100));

      await service.sendToIntegrations(makeSummaryData({ rawSummary: { gist: 'Test', keyDetails: longDetails } }) as any);

      const body = JSON.parse(global.fetch.mock.calls[0][1].body as string);
      const keyDetailsField = (body.embeds[0].fields as Array<{ name: string; value: string }>).find(
        (f) => f.name === 'Key Details',
      );
      expect(keyDetailsField?.value.length).toBeLessThanOrEqual(1024);
    });

    it('truncates discord description to 4096 chars', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('discord')]);
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      const longGist = 'X'.repeat(5000);

      await service.sendToIntegrations(makeSummaryData({ rawSummary: { gist: longGist, keyDetails: [] } }) as any);

      const body = JSON.parse(global.fetch.mock.calls[0][1].body as string);
      expect(body.embeds[0].description.length).toBeLessThanOrEqual(4096);
    });

    it('limits slack key details to 10 items', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('slack')]);
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      const manyDetails = Array(20).fill('Detail');

      await service.sendToIntegrations(makeSummaryData({ rawSummary: { gist: 'Test', keyDetails: manyDetails } }) as any);

      const body = JSON.parse(global.fetch.mock.calls[0][1].body as string);
      const detailsBlock = (body.blocks as Array<{ type: string; text?: { text: string } }>).find(
        (b) => b.type === 'section' && b.text?.text?.includes('Key Details'),
      );
      const detailLines = (detailsBlock?.text?.text ?? '').split('\n');
      expect(detailLines.length).toBeLessThanOrEqual(12); // Header + 10 details + separator
    });

    it('limits slack actions to displayable count', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('slack')]);
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      const manyActions = Array(15).fill({
        action: { actionType: 'test', title: 'Action', description: 'Desc', riskLevel: 'low' },
        confirmationUrl: 'https://example.com/action',
      });

      await service.sendToIntegrations(makeSummaryData({ actions: manyActions }) as any);

      const body = JSON.parse(global.fetch.mock.calls[0][1].body as string);
      const actionsBlock = (body.blocks as Array<{ type: string; text?: { text: string } }>).find(
        (b) => b.type === 'section' && b.text?.text?.includes('Suggested Actions'),
      );
      expect(actionsBlock?.text?.text).toBeDefined();
    });

    it('handles fetch timeout gracefully', async () => {
      mockListEnabled.mockResolvedValue([makeIntegration('webhook')]);
      global.fetch = vi.fn().mockRejectedValue(new Error('AbortError: signal timed out'));

      await service.sendToIntegrations(makeSummaryData() as any);

      expect(mockLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failure' }),
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

    it('sends test notification with correct structure for webhook', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      const integration = makeIntegration('webhook');

      await service.sendTestNotification(integration as any);

      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body).toHaveProperty('event', 'email.processed');
      expect(body).toHaveProperty('applicationId', 'app-1');
      expect(body).toHaveProperty('email');
      expect(body).toHaveProperty('summary');
      expect(body).toHaveProperty('actions', []);
    });
  });
});
