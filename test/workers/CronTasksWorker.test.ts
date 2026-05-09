import { beforeEach, describe, expect, it, vi } from 'vitest';

const { taskSpies } = vi.hoisted(() => ({
  taskSpies: {
    oauth2Refresh: vi.fn(),
    subscriptionRenewal: vi.fn(),
  },
}));

vi.mock('@/scheduled', () => ({
  OAuth2AccessTokenRefreshTask: class {
    handle = taskSpies.oauth2Refresh;
  },
}));

vi.mock('@/utils', () => ({
  SubscriptionRenewalUtil: {
    renewDueSubscriptions: taskSpies.subscriptionRenewal,
  },
}));

import { CronTasksWorker } from '@/workers/CronTasksWorker';

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

describe('CronTasksWorker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    taskSpies.oauth2Refresh.mockReset().mockResolvedValue(undefined);
    taskSpies.subscriptionRenewal.mockReset().mockResolvedValue(undefined);
  });

  it('runs token refresh before provider subscription renewal', async () => {
    const env = { DB: {} as D1Database } as Env;
    const worker = new CronTasksWorker(createDurableObjectState(), env);

    const response: Response = await worker.fetch(createRunRequest());

    await expect(response.json()).resolves.toEqual({ status: 'completed' });
    expect(taskSpies.oauth2Refresh).toHaveBeenCalledOnce();
    expect(taskSpies.subscriptionRenewal).toHaveBeenCalledWith(env);
    expect(taskSpies.oauth2Refresh.mock.invocationCallOrder[0]).toBeLessThan(taskSpies.subscriptionRenewal.mock.invocationCallOrder[0]);
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
    const worker = new CronTasksWorker(createDurableObjectState(), {} as Env);
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
