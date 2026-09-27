import { z } from 'zod';
import { RequestInputSchemas } from './input';
import type { RequestInputSchema } from './input';

/**
 * Map a concrete request path onto the `METHOD /path/:param` key used by
 * `RequestInputSchemas`.
 *
 * Only paths with path parameters need rewriting; every other path is already
 * its own registry key. A missing pattern here means the route resolves to a
 * key with no schema, which — because `validateRequestInput` falls back to
 * "valid" when no schema is found — would silently skip validation. Keep this
 * list and `RequestInputSchemas` in sync; `test/schema` asserts the two agree
 * for every registered route.
 */
const normalizePathname = (pathname: string): string => {
  const path: string = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;

  if (/^\/api\/oauth2\/callback\/[^/]+$/.test(path)) {
    return '/api/oauth2/callback/:applicationId';
  }
  if (/^\/api\/actions\/[^/]+\/execute$/.test(path)) {
    return '/api/actions/:actionId/execute';
  }
  if (/^\/api\/actions\/[^/]+$/.test(path)) {
    return '/api/actions/:actionId';
  }
  if (/^\/api\/webhooks\/gmail\/[^/]+$/.test(path)) {
    return '/api/webhooks/gmail/:applicationId';
  }
  if (/^\/api\/webhooks\/fastmail\/[^/]+$/.test(path)) {
    return '/api/webhooks/fastmail/:applicationId';
  }
  if (/^\/api\/webhooks\/outlook\/lifecycle\/[^/]+$/.test(path)) {
    return '/api/webhooks/outlook/lifecycle/:applicationId';
  }
  if (/^\/api\/webhooks\/outlook\/[^/]+$/.test(path)) {
    return '/api/webhooks/outlook/:applicationId';
  }
  if (/^\/user\/application\/context\/document\/[^/]+\/provider-link$/.test(path)) {
    return '/user/application/context/document/:contextDocumentId/provider-link';
  }
  if (/^\/user\/application\/context\/document\/[^/]+\/logs$/.test(path)) {
    return '/user/application/context/document/:contextDocumentId/logs';
  }
  if (/^\/user\/actions\/[^/]+\/executions$/.test(path)) {
    return '/user/actions/:actionId/executions';
  }
  if (/^\/user\/actions\/[^/]+\/execute$/.test(path)) {
    return '/user/actions/:actionId/execute';
  }
  if (/^\/user\/actions\/[^/]+\/snooze$/.test(path)) {
    return '/user/actions/:actionId/snooze';
  }
  return /^\/user\/actions\/[^/]+\/schedule$/.test(path) ? '/user/actions/:actionId/schedule' : path;
};

const getRouteKey = (request: Request): string => {
  const url: URL = new URL(request.url);
  return `${request.method.toUpperCase()} ${normalizePathname(url.pathname)}`;
};

/**
 * Collect query parameters into a plain object.
 *
 * A key repeated on the URL (`?types=a&types=b`) becomes an array so schemas
 * can declare `z.array(...)`; a key seen once stays a string so scalar fields
 * keep validating as scalars. Routes serving repeated parameters read them with
 * `IBaseRoute.getQueryParams`.
 */
const getQueryData = (request: Request): Record<string, string | string[]> => {
  const query: Record<string, string | string[]> = {};
  new URL(request.url).searchParams.forEach((value: string, key: string): void => {
    // `hasOwn` rather than an `undefined` check: the index signature is not
    // `noUncheckedIndexedAccess`, so a miss reads back as the value type.
    if (!Object.hasOwn(query, key)) {
      query[key] = value;
      return;
    }
    const existing: string | string[] = query[key];
    if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      query[key] = [existing, value];
    }
  });
  return query;
};

const formatValidationError = (scope: string, error: z.ZodError): string => {
  const issue = error.issues[0];
  if (!issue) return `Invalid request ${scope}.`;
  const path: string = issue.path.length > 0 ? issue.path.join('.') : scope;
  return `Invalid request ${scope}: ${path}: ${issue.message}`;
};

const getRequestInputSchema = (request: Request): RequestInputSchema | undefined => {
  return RequestInputSchemas[getRouteKey(request)];
};

/**
 * Validate query and body against the route's registered schema.
 *
 * A route with no registry entry used to be treated as valid, which made
 * validation fail *open*: a new route, or a path-parameter route whose
 * `normalizePathname` pattern was never added, silently skipped validation
 * while every test stayed green. Twenty of fifty-two registered routes were in
 * that state. An unregistered route is now rejected so the omission surfaces
 * immediately instead of as a production incident.
 *
 * On success `query` carries the validated query parameters (defaults and
 * coercions applied) so `IBaseRoute.getQueryParam` can serve reads from them
 * instead of re-parsing the raw URL. A parameter the schema does not declare is
 * absent from `query` and reads back as `undefined`.
 */
const validateRequestInput = async (request: Request, body: unknown) => {
  const routeKey: string = getRouteKey(request);
  const schema: RequestInputSchema | undefined = RequestInputSchemas[routeKey];
  if (!schema) {
    return {
      success: false as const,
      error: `No input schema registered for "${routeKey}". Add an entry to RequestInputSchemas.`,
      scope: 'route' as const,
    };
  }

  let validatedQuery: Record<string, unknown> = {};
  if (schema.query) {
    const queryResult = await schema.query.safeParseAsync(getQueryData(request));
    if (!queryResult.success) {
      return { success: false as const, error: formatValidationError('query', queryResult.error), scope: 'query' as const };
    }
    validatedQuery = (queryResult.data ?? {}) as Record<string, unknown>;
  }

  if (!schema.body) return { success: true as const, data: body, query: validatedQuery };

  const bodyResult = await schema.body.safeParseAsync(body);
  return bodyResult.success
    ? { success: true as const, data: bodyResult.data, query: validatedQuery }
    : { success: false as const, error: formatValidationError('body', bodyResult.error), scope: 'body' as const };
};

export { getRequestInputSchema, validateRequestInput };
export * from './common';
export * from './input';
