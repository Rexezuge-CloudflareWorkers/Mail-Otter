import { MailOtterWorker } from '@/workers';
import { describe, expect, it, vi } from 'vitest';

const executionContext: ExecutionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
};

describe('MailOtterWorker', () => {
  it('redirects root visits to the user console', async () => {
    const worker = new MailOtterWorker();

    const response = await worker.fetch(new Request('https://mail.example.com/'), {} as Env, executionContext);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/user/');
  });

  it('delegates scheduled triggers to the cron Durable Object', async () => {
    const worker = new MailOtterWorker();
    const durableObjectId = {} as DurableObjectId;
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: 'completed' }));
    const waitUntil = vi.fn();
    const env = {
      CRON_TASKS: {
        idFromName: vi.fn().mockReturnValue(durableObjectId),
        get: vi.fn().mockReturnValue({ fetch }),
      },
    } as unknown as Env;

    await worker.scheduled(
      {
        cron: '*/10 * * * *',
        scheduledTime: 1_778_200_000_000,
        noRetry: vi.fn(),
      },
      env,
      { ...executionContext, waitUntil },
    );

    expect(env.CRON_TASKS.idFromName).toHaveBeenCalledWith('global');
    expect(env.CRON_TASKS.get).toHaveBeenCalledWith(durableObjectId);
    expect(waitUntil).toHaveBeenCalledOnce();
    const request: Request = fetch.mock.calls[0][0];
    expect(new URL(request.url).pathname).toBe('/run');
    await expect(request.json()).resolves.toEqual({
      cron: '*/10 * * * *',
      scheduledTime: 1_778_200_000_000,
    });
  });
});
