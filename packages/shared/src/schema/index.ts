import { z } from 'zod';
import { RequestInputSchemas } from './input';
import type { RequestInputSchema } from './input';

const normalizePathname = (pathname: string): string => {
  const path: string = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;

  if (/^\/api\/oauth2\/callback\/[^/]+$/.test(path)) {
    return '/api/oauth2/callback/:applicationId';
  }
  if (/^\/api\/webhooks\/gmail\/[^/]+$/.test(path)) {
    return '/api/webhooks/gmail/:applicationId';
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
  return path;
};

const getRouteKey = (request: Request): string => {
  const url: URL = new URL(request.url);
  return `${request.method.toUpperCase()} ${normalizePathname(url.pathname)}`;
};

const getQueryData = (request: Request): Record<string, string> => {
  const query: Record<string, string> = {};
  new URL(request.url).searchParams.forEach((value: string, key: string): void => {
    query[key] = value;
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

const validateRequestInput = async (request: Request, body: unknown) => {
  const schema: RequestInputSchema | undefined = getRequestInputSchema(request);
  if (!schema) return { success: true as const, data: body };

  if (schema.query) {
    const queryResult = await schema.query.safeParseAsync(getQueryData(request));
    if (!queryResult.success) {
      return { success: false as const, error: formatValidationError('query', queryResult.error), scope: 'query' as const };
    }
  }

  if (!schema.body) return { success: true as const, data: body };

  const bodyResult = await schema.body.safeParseAsync(body);
  if (!bodyResult.success) {
    return { success: false as const, error: formatValidationError('body', bodyResult.error), scope: 'body' as const };
  }

  return { success: true as const, data: bodyResult.data };
};

export { getRequestInputSchema, validateRequestInput };
export * from './common';
export * from './input';
