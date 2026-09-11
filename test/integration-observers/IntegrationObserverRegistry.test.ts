import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockListEnabled,
  mockGetDecryptedWebhookUrl,
  mockLogCreate,
} = vi.hoisted(() => ({
  mockListEnabled: vi.fn(),
  mockGetDecryptedWebhookUrl: vi.fn(),
  mockLogCreate: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ApplicationIntegrationDAO: vi.fn(function () {
    return {
      listEnabled: mockListEnabled,
      getDecryptedWebhookUrl: mockGetDecryptedWebhookUrl,
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

function makeIntegration(type: 'slack' | 'discord' | 'webhook', id: string) {
  return {
    integrationId: id,
    applicationId: 'app-1',
    integrationType: type,
    name: `${type} observer`,
    maskedWebhookUrl: 'https://hooks.example.com/...',
    enabled: true,
    createdAt: 1_778_200_000,
    updatedAt: 1_778_200_000,
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
    consecutiveFailures: 0,
  };
}

function makeSummaryData() {
  return {
    application: { applicationId: 'app-1' },
    emailSubject: 'Order Confirmed',
    emailFrom: 'shop@example.com',
    rawSummary: { gist: 'Your order has been confirmed.', keyDetails: ['Order #12345'] },
    actions: [],
  };
}

describe('IntegrationObserverRegistry (IntegrationService fan-out)', () => {
  let service: IntegrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IntegrationService(makeEnv());
    mockGetDecryptedWebhookUrl.mockResolvedValue('https://hooks.example.com/webhook/secret');
    mockLogCreate.mockResolvedValue({});
  });

  it('notifies every registered observer with its type-specific payload', async () => {
    mockListEnabled.mockResolvedValue([
      makeIntegration('slack', 'integ-slack'),
      makeIntegration('discord', 'integ-discord'),
      makeIntegration('webhook', 'integ-webhook'),
    ]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    await service.sendToIntegrations(makeSummaryData() as never);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse((call[1] as { body: string }).body as string));
    expect(bodies[0]).toHaveProperty('blocks');
    expect(bodies[1]).toHaveProperty('embeds');
    expect(bodies[2]).toHaveProperty('event', 'email.processed');
    expect(mockLogCreate).toHaveBeenCalledTimes(3);
  });

  it('isolates observer failures so one broken webhook never blocks the rest', async () => {
    mockListEnabled.mockResolvedValue([makeIntegration('slack', 'integ-broken'), makeIntegration('webhook', 'integ-ok')]);
    mockGetDecryptedWebhookUrl
      .mockRejectedValueOnce(new Error('secret deleted'))
      .mockResolvedValueOnce('https://hooks.example.com/webhook/secret');
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    await service.sendToIntegrations(makeSummaryData() as never);

    expect(mockLogCreate).toHaveBeenCalledTimes(2);
    expect(mockLogCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failure' }));
    expect(mockLogCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it('skips dispatch entirely when no observers are registered', async () => {
    mockListEnabled.mockResolvedValue([]);
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await service.sendToIntegrations(makeSummaryData() as never);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockLogCreate).not.toHaveBeenCalled();
  });

  it('delivers test notifications through the registered observer', async () => {
    mockGetDecryptedWebhookUrl.mockResolvedValue('https://hooks.example.com/webhook/secret');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;
    const integration = makeIntegration('slack', 'integ-slack');

    await expect(service.sendTestNotification(integration as never)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('surfaces test delivery failures to the caller', async () => {
    mockGetDecryptedWebhookUrl.mockResolvedValue('https://hooks.example.com/webhook/secret');
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(service.sendTestNotification(makeIntegration('webhook', 'integ-1') as never)).rejects.toThrow(
      'HTTP 500',
    );
  });
});
