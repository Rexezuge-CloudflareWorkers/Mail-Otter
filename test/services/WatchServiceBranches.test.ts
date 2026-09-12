import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WatchService } from '@mail-otter/backend-services/subscription';
import { BadRequestError, NotFoundError } from '@mail-otter/backend-errors';

function makeApp(overrides: Record<string, unknown> = {}) {
  return {
    applicationId: 'app-1',
    userEmail: 'u@x',
    providerId: 'google-gmail',
    connectionMethod: 'oauth2',
    status: 'connected',
    providerEmail: 'u@gmail.com',
    watchedFolders: null,
    gmailPubsubTopicName: 'projects/p/topics/t',
    ...overrides,
  };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const subscriptionDAO = {
    upsertActive: vi.fn(async (input: unknown) => ({ status: 'active', expiresAt: 999, ...(input as object) })),
    getByApplication: vi.fn(async () => undefined),
    markStopped: vi.fn(async () => undefined),
  };
  const applicationDAO = { getByIdForUser: vi.fn(async () => makeApp()) };
  const tokenService = { getAccessToken: vi.fn(async () => 'tok') };
  const provider = {
    startWatch: vi.fn(async () => ({ type: 'webhook', message: 'ok', webhookUrl: 'https://x/__APPLICATION_ID__' })),
    stopWatch: vi.fn(async () => undefined),
  };
  const providerRegistry = { get: vi.fn(() => provider) };
  return {
    deps: {
      subscriptionDAO: async () => subscriptionDAO as never,
      applicationDAO: async () => applicationDAO as never,
      tokenService: async () => tokenService as never,
      providerRegistry: providerRegistry as never,
    },
    subscriptionDAO,
    applicationDAO,
    tokenService,
    provider,
    providerRegistry,
    ...overrides,
  };
}

function makeEnv() {
  return { DB: {} } as never;
}

describe('WatchService branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NotFound for unknown applications', async () => {
    const ctx = makeDeps();
    ctx.applicationDAO.getByIdForUser.mockResolvedValue(undefined);
    const svc = new WatchService(makeEnv(), ctx.deps);
    await expect(svc.startApplicationWatch('u@x', 'missing', 'https://x')).rejects.toThrow(NotFoundError);
    await expect(svc.stopApplicationWatch('u@x', 'missing')).rejects.toThrow(NotFoundError);
  });

  it('requires connected status and mailbox metadata', async () => {
    const ctx = makeDeps();
    ctx.applicationDAO.getByIdForUser.mockResolvedValue(makeApp({ status: 'draft' }));
    const svc = new WatchService(makeEnv(), ctx.deps);
    await expect(svc.startApplicationWatch('u@x', 'app-1', 'https://x')).rejects.toThrow(BadRequestError);
    ctx.applicationDAO.getByIdForUser.mockResolvedValue(makeApp({ providerEmail: null }));
    await expect(svc.startApplicationWatch('u@x', 'app-1', 'https://x')).rejects.toThrow(BadRequestError);
  });

  it('starts webhook watches and substitutes the application id', async () => {
    const ctx = makeDeps();
    const svc = new WatchService(makeEnv(), ctx.deps);
    const result = await svc.startApplicationWatch('u@x', 'app-1', 'https://x');
    expect(ctx.provider.startWatch).toHaveBeenCalledWith(
      { type: 'oauth2', accessToken: 'tok' },
      expect.objectContaining({ baseUrl: 'https://x', applicationId: 'app-1' }),
    );
    expect(result.webhookUrl).toBe('https://x/app-1');
    expect(result.watchStatus).toBe('active');
  });

  it('starts IMAP watches without client state', async () => {
    const ctx = makeDeps();
    ctx.applicationDAO.getByIdForUser.mockResolvedValue(
      makeApp({ providerId: 'custom-imap', connectionMethod: 'imap-password', imapUsername: 'u', imapPassword: 'p', imapHost: 'h', imapPort: 993 }),
    );
    ctx.provider.startWatch.mockResolvedValue({ type: 'imap-cursor', imapCursor: '5' });
    const svc = new WatchService(makeEnv(), ctx.deps);
    const result = await svc.startApplicationWatch('u@x', 'app-1', 'https://x');
    expect(ctx.provider.startWatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'imap-password' }),
      expect.objectContaining({ clientState: undefined }),
    );
    expect(result.message).toContain('poll');
  });

  it('rejects incomplete IMAP credentials', async () => {
    const ctx = makeDeps();
    ctx.applicationDAO.getByIdForUser.mockResolvedValue(
      makeApp({ connectionMethod: 'imap-password', imapUsername: null, imapPassword: null }),
    );
    const svc = new WatchService(makeEnv(), ctx.deps);
    await expect(svc.startApplicationWatch('u@x', 'app-1', 'https://x')).rejects.toThrow(BadRequestError);
  });

  it('stops watches and tolerates provider unsubscribe failures', async () => {
    const ctx = makeDeps();
    ctx.subscriptionDAO.getByApplication.mockResolvedValue({ externalSubscriptionId: 'sub-1' });
    const svc = new WatchService(makeEnv(), ctx.deps);
    await svc.stopApplicationWatch('u@x', 'app-1');
    expect(ctx.provider.stopWatch).toHaveBeenCalledWith('tok', 'sub-1');
    expect(ctx.subscriptionDAO.markStopped).toHaveBeenCalledWith('app-1');
    ctx.provider.stopWatch.mockRejectedValue(new Error('gone'));
    await expect(svc.stopApplicationWatch('u@x', 'app-1')).resolves.toBeUndefined();
  });
});
