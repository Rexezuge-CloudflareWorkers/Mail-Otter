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

  describe('response hardening', () => {
    /**
    A request against a path that reaches no route, so the assertion is about
    the worker's own middleware rather than about any handler's behaviour.
    */
    async function probe(path: string, headers: Record<string, string> = {}): Promise<Response> {
      const worker = new MailOtterWorker();
      return worker.fetch(new Request(`https://mail.example.com${path}`, { headers }), {} as Env, executionContext);
    }

    it('returns security headers on a 404', async () => {
      // The 404 is as clickable as the SPA shell, so it has to carry them too --
      // which is only true if the header middleware is registered before the
      // catch-all, not after it.
      const response = await probe('/nothing-here');
      expect(response.status).toBe(404);
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Referrer-Policy')).toBe('same-origin');
    });

    it('sends HSTS, because the deployment is served over TLS', async () => {
      const response = await probe('/');
      expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    });

    it('does not throttle the provider webhook surface', async () => {
      // Providers batch and re-deliver on their own schedule, so the webhook
      // paths carry no limiter by design. Asserted here rather than in
      // `HttpHardening.test.ts` because this is a fact about *registration*, and
      // a limiter has no path awareness of its own.
      const statuses = new Set<number>();
      for (let index = 0; index < 200; index++) {
        statuses.add((await probe('/api/webhooks/gmail/app_1')).status);
      }
      expect(statuses).not.toContain(429);
    });
  });
});
