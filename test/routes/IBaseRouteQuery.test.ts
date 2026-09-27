import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IBaseRoute } from '../../apps/api/src/endpoints/IBaseRoute';

/**
 * `getQueryParam` must serve the values the route's schema produced, not a
 * re-parse of the raw URL.
 *
 * It used to build a fresh `URL(request.raw.url)` on every call, so a handler
 * could read a parameter that had been validated under a different name, or
 * not validated at all. Query strings are now validated by
 * `validateRequestInput` and attached to the request for the duration of
 * `handleRequest`.
 *
 * These drive `handle` end to end against the real schema for
 * `GET /user/activity`, rather than stubbing validation, so the assertions
 * cover the actual coercion and defaulting behaviour.
 */
class QueryProbeRoute extends IBaseRoute<
  { raw: Request },
  { limit: string | null; types: string[]; sneaky: string | null; applicationId: string | null },
  Record<string, unknown>
> {
  public seen: { limit?: string; types?: string[]; sneaky?: string | null; applicationId?: string | null } = {};

  protected async handleRequest(request: { raw: Request }): Promise<{
    limit: string | null;
    types: string[];
    sneaky: string | null;
    applicationId: string | null;
  }> {
    this.seen = {
      limit: this.getQueryParam(request, 'limit'),
      types: this.getQueryParams(request, 'types'),
      sneaky: this.getQueryParam(request, 'sneaky'),
      applicationId: this.getQueryParam(request, 'applicationId'),
    };
    return {
      limit: this.seen.limit ?? null,
      types: this.seen.types ?? [],
      sneaky: this.seen.sneaky ?? null,
      applicationId: this.seen.applicationId ?? null,
    };
  }
}

const makeContext = (path: string): { json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } =>
  ({
    req: {
      raw: new Request(`https://example.com${path}`),
      json: vi.fn().mockResolvedValue({}),
    },
    json: vi.fn().mockReturnValue(new Response()),
    status: vi.fn(),
    header: vi.fn(),
    body: vi.fn(),
    env: {},
  }) as never;

describe('IBaseRoute query parameters', () => {
  let route: QueryProbeRoute;

  beforeEach(() => {
    route = new QueryProbeRoute();
  });

  it('serves the coerced value the schema produced', async () => {
    const context = makeContext('/user/activity?limit=25');
    await route.handle(context as never);
    // `limit` is `z.coerce.number()`, so the handler sees the stringified 25
    // rather than whatever the URL happened to spell.
    expect(route.seen.limit).toBe('25');
  });

  it('hides a parameter the schema does not declare', async () => {
    const context = makeContext('/user/activity?sneaky=evil');
    await route.handle(context as never);
    // `sneaky` is stripped by the schema, so it must not be readable even
    // though it is present on the URL.
    expect(route.seen.sneaky).toBeUndefined();
  });

  it('exposes a repeated parameter as an array', async () => {
    const context = makeContext('/user/activity?types=action_created&types=action_executed');
    await route.handle(context as never);
    expect(route.seen.types).toEqual(['action_created', 'action_executed']);
  });

  it('accepts a single value for a repeated parameter', async () => {
    const context = makeContext('/user/activity?types=action_created');
    await route.handle(context as never);
    expect(route.seen.types).toEqual(['action_created']);
  });

  it('rejects a repeated parameter containing an unknown value', async () => {
    const context = makeContext('/user/activity?types=action_created&types=not_a_type');
    await route.handle(context as never);
    // Validation failed, so the handler never ran.
    expect(route.seen.types).toBeUndefined();
    expect(context.json).toHaveBeenCalled();
  });

  it('does not leak query state between requests', async () => {
    await route.handle(makeContext('/user/activity?limit=7') as never);
    expect(route.seen.limit).toBe('7');

    // A fresh request without the parameter must not observe the previous one.
    await route.handle(makeContext('/user/activity') as never);
    expect(route.seen.limit).toBeUndefined();
  });
});
