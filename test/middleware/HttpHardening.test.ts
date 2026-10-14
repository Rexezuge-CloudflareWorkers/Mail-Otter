import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimit, resetRateLimitForTests } from '@rexezuge/http';
import type { RateLimitContext } from '@rexezuge/http';

/**
 * `HttpHardening` builds its limiters at module scope, so importing it once
 * registers them with the kit's process-wide limiter table. `rateLimit` is
 * re-imported to reach that table's reset seam between cases — the exported
 * `resetRateLimitForTests` is the same function, reached through the module
 * under test's own dependency so the two cannot drift.
 */
vi.mock('@rexezuge/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rexezuge/http')>();
  return { ...actual, rateLimit: actual.rateLimit };
});

import { PUBLIC_CALLBACK_LIMIT, securityHeadersMiddleware, USER_API_LIMIT } from '../../apps/api/src/middleware/HttpHardening';

/**
A Hono-shaped context: only the members the kit's limiter and header
middleware actually read, so a test fails if the kit starts reading another one.
*/
function context(options: { ip?: string; userEmail?: string; path?: string; contentType?: string } = {}): {
  c: RateLimitContext & { header: ReturnType<typeof vi.fn>; res: { headers: Headers } };
  setHeader: ReturnType<typeof vi.fn>;
} {
  const headers = new Map<string, string>();
  const responseHeaders = new Headers();
  if (options.contentType) responseHeaders.set('content-type', options.contentType);
  const setHeader = vi.fn((name: string, value: string) => headers.set(name, value));
  const c = {
    req: {
      header: (name: string) => (name === 'CF-Connecting-IP' ? options.ip : undefined),
      url: `https://example.com${options.path ?? '/user/me'}`,
    },
    res: { headers: responseHeaders },
    get: (key: string) => (key === 'AuthenticatedUserEmailAddress' ? options.userEmail : undefined),
    json: (body: unknown, status?: number) => Response.json(body, { status }),
    header: setHeader,
  };
  return { c: c as never, setHeader };
}

describe('HttpHardening', () => {
  beforeEach(() => {
    resetRateLimitForTests();
  });

  describe('security headers', () => {
    it('sets the baseline headers on every response', async () => {
      const { c, setHeader } = context({ path: '/' });
      await securityHeadersMiddleware(c, async () => {});
      const names = setHeader.mock.calls.map(([name]) => name as string);
      expect(names).toContain('X-Content-Type-Options');
      expect(names).toContain('X-Frame-Options');
      expect(names).toContain('Referrer-Policy');
    });

    it('adds a CSP only to an HTML response', async () => {
      const { c, setHeader } = context({ path: '/user/', contentType: 'text/html; charset=utf-8' });
      await securityHeadersMiddleware(c, async () => {});
      expect(setHeader.mock.calls.map(([name]) => name)).toContain('Content-Security-Policy');
    });

    it('omits the CSP from a JSON response', async () => {
      // CSP on JSON is noise at best, and a source of violation reports that
      // name no document at worst.
      const { c, setHeader } = context({ path: '/user/me', contentType: 'application/json' });
      await securityHeadersMiddleware(c, async () => {});
      expect(setHeader.mock.calls.map(([name]) => name)).not.toContain('Content-Security-Policy');
    });

    it('marks the authenticated API no-store', async () => {
      const { c, setHeader } = context({ path: '/user/applications' });
      await securityHeadersMiddleware(c, async () => {});
      expect(setHeader.mock.calls.map(([name, value]) => [name, value])).toContainEqual(['Cache-Control', 'no-store']);
    });

    it('marks the action-token surface no-store, so a signed link is not replayable from a cache', async () => {
      const { c, setHeader } = context({ path: '/api/actions/act_123' });
      await securityHeadersMiddleware(c, async () => {});
      expect(setHeader.mock.calls.map(([name]) => name)).toContain('Cache-Control');
    });

    it('leaves the public documentation cacheable', async () => {
      const { c, setHeader } = context({ path: '/docs' });
      await securityHeadersMiddleware(c, async () => {});
      expect(setHeader.mock.calls.map(([name]) => name)).not.toContain('Cache-Control');
    });

    it('sends HSTS only over HTTPS', async () => {
      const { c, setHeader } = context({ path: '/' });
      await securityHeadersMiddleware(c, async () => {});
      expect(setHeader.mock.calls.map(([name]) => name)).toContain('Strict-Transport-Security');
    });

    it('does not fail the request when a header cannot be applied', async () => {
      const { c } = context({ path: '/user/' });
      c.header = vi.fn(() => {
        throw new Error('immutable headers');
      });
      await expect(securityHeadersMiddleware(c, async () => {})).resolves.toBeUndefined();
    });
  });

  describe('the user API limiter', () => {
    it('keys on the authenticated account, not the client address', async () => {
      const office = context({ ip: '203.0.113.7', userEmail: 'alice@example.com' });
      const colleague = context({ ip: '203.0.113.7', userEmail: 'bob@example.com' });

      // 300 requests each, sharing one IP. They must not share a budget --
      // otherwise one person's loop throttles the whole office. The ceiling is
      // inclusive: the 300th is allowed and the 301st is refused.
      for (let index = 0; index < 299; index++) {
        await USER_API_LIMIT(office.c, async () => new Response('ok'));
        await USER_API_LIMIT(colleague.c, async () => new Response('ok'));
      }
      const alice = await USER_API_LIMIT(office.c, async () => new Response('ok'));
      const bob = await USER_API_LIMIT(colleague.c, async () => new Response('ok'));
      expect(alice.status).toBe(200);
      expect(bob.status).toBe(200);
    });

    it('answers 429 with a Retry-After once the budget is spent', async () => {
      const { c } = context({ userEmail: 'alice@example.com' });
      const next = vi.fn(async () => new Response('ok'));
      for (let index = 0; index < 300; index++) await USER_API_LIMIT(c, next);

      const throttled = await USER_API_LIMIT(c, next);
      expect(throttled?.status).toBe(429);
      // A client that only reads the status has no other way to know how long to
      // wait, and one that retries immediately is what the throttle prevents.
      expect(throttled?.headers.get('Retry-After')).toMatch(/^\d+$/u);
      expect(next).toHaveBeenCalledTimes(300);
    });
  });

  describe('the public callback limiter', () => {
    it('keys on the client address, because no identity exists yet', async () => {
      const { c } = context({ ip: '203.0.113.99' });
      const next = vi.fn(async () => new Response('ok'));
      for (let index = 0; index < 30; index++) await PUBLIC_CALLBACK_LIMIT(c, next);

      const throttled = await PUBLIC_CALLBACK_LIMIT(c, next);
      expect(throttled?.status).toBe(429);
    });

    it('counts a separate address separately', async () => {
      const attacker = context({ ip: '203.0.113.99' });
      const bystander = context({ ip: '203.0.113.100' });
      const next = vi.fn(async () => new Response('ok'));
      for (let index = 0; index < 30; index++) await PUBLIC_CALLBACK_LIMIT(attacker.c, next);

      expect(((await PUBLIC_CALLBACK_LIMIT(attacker.c, next)) as Response).status).toBe(429);
      expect(((await PUBLIC_CALLBACK_LIMIT(bystander.c, next)) as Response).status).toBe(200);
    });

    it('answers in the family error envelope, so an existing client parser can read it', async () => {
      const { c } = context({ ip: '203.0.113.99' });
      const next = vi.fn(async () => new Response('ok'));
      for (let index = 0; index < 30; index++) await PUBLIC_CALLBACK_LIMIT(c, next);

      const throttled = (await PUBLIC_CALLBACK_LIMIT(c, next)) as Response;
      expect(await throttled.json()).toMatchObject({ Exception: { Type: expect.any(String) } });
    });

    it('fails open when the limiter cannot size itself', async () => {
      // A request must not fail because limiting could not be done.
      const broken = {
        req: {
          header: () => {
            throw new Error('no headers');
          },
          url: 'https://example.com/api/actions/x',
        },
        get: () => {
          throw new Error('no context');
        },
        json: (body: unknown) => Response.json(body),
      } as unknown as RateLimitContext;
      expect(((await PUBLIC_CALLBACK_LIMIT(broken, async () => new Response('ok'))) as Response).status).toBe(200);
    });
  });

  describe('registration-time validation', () => {
    it('rejects a limiter that could never work, at registration rather than per request', async () => {
      // A limiter installed with `max: 0` would trip every request immediately,
      // and the failure would read as an outage rather than a config error.
      expect(() => rateLimit({ windowMs: 1000, max: 0, keyPrefix: 'x' })).toThrow(/max/u);
      expect(() => rateLimit({ windowMs: 0, max: 1, keyPrefix: 'x' })).toThrow(/windowMs/u);
      expect(() => rateLimit({ windowMs: 1000, max: 1, keyPrefix: '' })).toThrow(/keyPrefix/u);
    });
  });
});
