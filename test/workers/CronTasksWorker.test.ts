import { beforeEach, describe, expect, it, vi } from 'vitest';

const { taskSpies } = vi.hoisted(() => ({
  taskSpies: {
    oauth2Refresh: vi.fn(),
    contextPruning: vi.fn(),
    processedMessagePruning: vi.fn(),
    staleContextDocumentPruning: vi.fn(),
    oauth2SessionPruning: vi.fn(),
    contextDeletionRunPruning: vi.fn(),
    aiDailyUsagePruning: vi.fn(),
    emailActionPruning: vi.fn(),
    subscriptionRenewal: vi.fn(),
  },
}));

vi.mock('@mail-otter/background/scheduled', () => ({
  OAuth2AccessTokenRefreshTask: class {
    handle = taskSpies.oauth2Refresh;
  },
  ContextDocumentPruningTask: class {
    handle = taskSpies.contextPruning;
  },
  ProcessedMessagePruningTask: class {
    handle = taskSpies.processedMessagePruning;
  },
  StaleContextDocumentPruningTask: class {
    handle = taskSpies.staleContextDocumentPruning;
  },
  OAuth2SessionPruningTask: class {
    handle = taskSpies.oauth2SessionPruning;
  },
  ContextDeletionRunPruningTask: class {
    handle = taskSpies.contextDeletionRunPruning;
  },
  AiDailyUsagePruningTask: class {
    handle = taskSpies.aiDailyUsagePruning;
  },
  EmailActionPruningTask: class {
    handle = taskSpies.emailActionPruning;
  },
}));

vi.mock('@mail-otter/backend-services/subscription', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@mail-otter/backend-services/subscription');
  return {
    ...actual,
    SubscriptionRenewalUtil: {
      ...actual.SubscriptionRenewalUtil,
      renewDueSubscriptions: taskSpies.subscriptionRenewal,
    },
  };
});

import { CronTasksWorker } from '@mail-otter/background';

function createDurableObjectState(): DurableObjectState {
  return {
    waitUntil: vi.fn(),
  } as unknown as DurableObjectState;
}

function createRunRequest(): Request {
  return new Request('https://cron-tasks.invalid/run', {
    method: 'POST',
    body: JSON.stringify({
      cron: '*/10 * * * *',
      scheduledTime: 1778200000000,
    }),
  });
}

function createEnv(): Env {
  return {
    DB: {
      withSession: vi.fn(() => ({}) as D1DatabaseSession),
    } as unknown as D1Database,
  } as Env;
}

describe('CronTasksWorker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    taskSpies.oauth2Refresh.mockReset().mockResolvedValue(undefined);
    taskSpies.contextPruning.mockReset().mockResolvedValue(undefined);
    taskSpies.processedMessagePruning.mockReset().mockResolvedValue(undefined);
    taskSpies.staleContextDocumentPruning.mockReset().mockResolvedValue(undefined);
    taskSpies.oauth2SessionPruning.mockReset().mockResolvedValue(undefined);
    taskSpies.contextDeletionRunPruning.mockReset().mockResolvedValue(undefined);
    taskSpies.aiDailyUsagePruning.mockReset().mockResolvedValue(undefined);
    taskSpies.emailActionPruning.mockReset().mockResolvedValue(undefined);
    taskSpies.subscriptionRenewal.mockReset().mockResolvedValue(undefined);
  });

  it('runs token refresh before provider subscription renewal', async () => {
    const env = createEnv();
    const worker = new CronTasksWorker(createDurableObjectState(), env);

    const response: Response = await worker.fetch(createRunRequest());

    await expect(response.json()).resolves.toEqual({ status: 'completed' });
    expect(taskSpies.oauth2Refresh).toHaveBeenCalledOnce();
    expect(taskSpies.contextPruning).toHaveBeenCalledOnce();
    expect(taskSpies.processedMessagePruning).toHaveBeenCalledOnce();
    expect(taskSpies.staleContextDocumentPruning).toHaveBeenCalledOnce();
    expect(taskSpies.oauth2SessionPruning).toHaveBeenCalledOnce();
    expect(taskSpies.contextDeletionRunPruning).toHaveBeenCalledOnce();
    expect(taskSpies.aiDailyUsagePruning).toHaveBeenCalledOnce();
    expect(taskSpies.emailActionPruning).toHaveBeenCalledOnce();
    expect(taskSpies.subscriptionRenewal).toHaveBeenCalledWith(expect.objectContaining({ DB: expect.any(Object) }));
    expect(taskSpies.oauth2Refresh.mock.invocationCallOrder[0]).toBeLessThan(taskSpies.contextPruning.mock.invocationCallOrder[0]);
    expect(taskSpies.contextPruning.mock.invocationCallOrder[0]).toBeLessThan(taskSpies.processedMessagePruning.mock.invocationCallOrder[0]);
    expect(taskSpies.oauth2Refresh.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        cron: '*/10 * * * *',
        scheduledTime: 1778200000000,
      }),
    );
  });

  it('returns accepted when a cron run is already active', async () => {
    let resolveRefresh: () => void = () => undefined;
    taskSpies.oauth2Refresh.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const worker = new CronTasksWorker(createDurableObjectState(), createEnv());
    const firstResponsePromise: Promise<Response> = worker.fetch(createRunRequest());
    await Promise.resolve();
    await Promise.resolve();

    const secondResponse: Response = await worker.fetch(createRunRequest());

    expect(secondResponse.status).toBe(202);
    await expect(secondResponse.json()).resolves.toEqual({ status: 'already_running' });

    resolveRefresh();
    await expect(firstResponsePromise).resolves.toHaveProperty('status', 200);
  });

  it('rejects unsupported routes and methods', async () => {
    const worker = new CronTasksWorker(createDurableObjectState(), {} as Env);

    const notFoundResponse: Response = await worker.fetch(new Request('https://cron-tasks.invalid/missing', { method: 'POST' }));
    const methodResponse: Response = await worker.fetch(new Request('https://cron-tasks.invalid/run', { method: 'GET' }));

    expect(notFoundResponse.status).toBe(404);
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get('Allow')).toBe('POST');
  });
});
