import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetById,
  mockListActiveImapSubscriptions,
  mockFailRun,
  mockGetProvider,
  mockPollNewMessages,
  mockGetAccessToken,
} = vi.hoisted(() => ({
  mockGetById: vi.fn(),
  mockListActiveImapSubscriptions: vi.fn().mockResolvedValue([]),
  mockFailRun: vi.fn().mockResolvedValue(undefined),
  mockGetProvider: vi.fn(),
  mockPollNewMessages: vi.fn(),
  mockGetAccessToken: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return { getById: mockGetById };
  }),
  ProviderSubscriptionDAO: vi.fn(function () {
    return {
      listActiveImapSubscriptions: mockListActiveImapSubscriptions,
      updateImapCursor: vi.fn().mockResolvedValue(undefined),
    };
  }),
  BackgroundTaskRunDAO: vi.fn(function () {
    return {
      startRun: vi.fn().mockResolvedValue('run-1'),
      succeedRun: vi.fn().mockResolvedValue(undefined),
      failRun: mockFailRun,
      skipRun: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('@mail-otter/backend-data/utils', () => ({
  createD1SessionEnv: vi.fn((env: unknown) => env),
}));

vi.mock('@mail-otter/backend-services/provider', () => ({
  EmailProviderRegistry: { get: mockGetProvider },
}));

vi.mock('@mail-otter/backend-services/oauth2', () => ({
  OAuth2AccessTokenService: vi.fn(function () {
    return { getAccessToken: mockGetAccessToken };
  }),
}));

import { ImapPollingTask } from '@mail-otter/background/scheduled/ImapPollingTask';

describe('ImapPollingTask error sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListActiveImapSubscriptions.mockResolvedValue([
      { subscriptionId: 'sub-1', applicationId: 'app-1', imapCursor: '5' },
    ]);
    mockGetById.mockResolvedValue({
      applicationId: 'app-1',
      providerId: 'google-gmail',
      connectionMethod: 'oauth2',
      providerEmail: 'user@gmail.com',
      status: 'connected',
    });
    mockGetProvider.mockReturnValue({ pollNewMessages: mockPollNewMessages });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts token material from console output and run records', async () => {
    mockGetAccessToken.mockRejectedValue(new Error('OAuth2 token worker failed: access_token=supersecret123'));
    const env = {
      DB: {},
      AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master') },
      OAUTH2_TOKEN_CACHE: {},
      OAUTH2_TOKEN_REFRESHERS: {},
      EMAIL_EVENTS_QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
    } as never;
    const task = new ImapPollingTask() as unknown as {
      handleScheduledTask(event: unknown, env: never, ctx: unknown): Promise<unknown>;
    };
    await task.handleScheduledTask({}, env, {});
    expect(mockFailRun).toHaveBeenCalledTimes(1);
    const recorded = String(mockFailRun.mock.calls[0]?.[1] ?? '');
    expect(recorded).not.toContain('supersecret123');
    expect(recorded).toContain('[REDACTED]');
    expect(console.error).toHaveBeenCalledTimes(1);
    const logged = String((console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.join(' ') ?? '');
    expect(logged).not.toContain('supersecret123');
  });
});
