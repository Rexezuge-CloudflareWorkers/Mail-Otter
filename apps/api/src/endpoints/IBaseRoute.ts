import { OpenAPIRoute } from 'chanfana';
import { Context } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import { BadRequestError, DefaultInternalServerError, ServiceError } from '@mail-otter/backend-errors';
import { validateRequestInput } from '@mail-otter/shared/schema';
import { logError } from '@mail-otter/shared/utils';

abstract class IBaseRoute<TRequest extends IRequest, TResponse extends IResponse, TEnv extends IEnv> extends OpenAPIRoute {
  async handle(c: RouteContext<TEnv>) {
    try {
      let body: unknown = {};
      try {
        body = await c.req.json();
      } catch {
        body = {};
      }
      const validationResult = await validateRequestInput(c.req.raw, body);
      if (!validationResult.success) {
        throw new BadRequestError(validationResult.error);
      }
      const validatedBody: unknown = validationResult.data;
      const request: TRequest = { ...(validatedBody as TRequest), raw: c.req.raw };
      // Serve query reads from the validated values rather than re-parsing the
      // URL, so a handler can never observe a parameter the schema rejected or
      // never declared.
      VALIDATED_QUERY.set(request, validationResult.query ?? {});
      try {
        const response: TResponse | ExtendedResponse<TResponse> = await this.handleRequest(request, c.env as TEnv, c);
        return this.toResponse(response, c);
      } finally {
        VALIDATED_QUERY.delete(request);
      }
    } catch (error: unknown) {
      return this.toErrorResponse(error, c);
    }
  }

  protected abstract handleRequest(request: TRequest, env: TEnv, cxt: RouteContext<TEnv>): Promise<TResponse | ExtendedResponse<TResponse>>;

  protected toResponse(response: TResponse | ExtendedResponse<TResponse>, c: RouteContext<TEnv>) {
    if (
      response &&
      typeof response === 'object' &&
      ('body' in response || 'rawBody' in response || 'statusCode' in response || 'headers' in response)
    ) {
      const extendedResponse: ExtendedResponse<TResponse> = response;
      const statusCode: number = extendedResponse.statusCode || 200;
      const headers = Object.entries(extendedResponse.headers ?? {});
      for (const [key, value] of headers) {
        c.header(key, value);
      }
      c.status(statusCode as StatusCode);
      if (statusCode >= 300 && statusCode < 400) {
        return c.body(null);
      }
      return 'rawBody' in extendedResponse ? c.body((extendedResponse.rawBody ?? null) as never) : c.json(extendedResponse.body);
    }
    return c.json(response);
  }

  /**
   * Read a validated query parameter.
   *
   * In the served request path this serves the value the route's zod schema
   * produced, so defaults and coercions are applied and a parameter the schema
   * does not declare reads back as `undefined`. Previously this re-parsed
   * `request.raw.url`, which let a handler observe a parameter that had never
   * been validated. Coerced non-strings are stringified to keep the signature
   * stable; use `getQueryParams` for repeated parameters.
   *
   * The raw-URL fallback only applies when no validation was recorded for this
   * request object, which happens when a test invokes `handleRequest` directly
   * instead of going through `handle`. `handle` always records first, so
   * production never takes that branch.
   */
  protected getQueryParam(request: IRequest, name: string): string | undefined {
    const validated: Record<string, unknown> | undefined = VALIDATED_QUERY.get(request);
    if (validated === undefined) {
      return new URL(request.raw.url).searchParams.get(name) ?? undefined;
    }
    const values: unknown[] = IBaseRoute.toValues(validated[name]);
    const last: unknown = values.at(-1);
    return IBaseRoute.toQueryString(last);
  }

  /**
   * Read every occurrence of a repeated query parameter.
   */
  protected getQueryParams(request: IRequest, name: string): string[] {
    const validated: Record<string, unknown> | undefined = VALIDATED_QUERY.get(request);
    return validated === undefined
      ? new URL(request.raw.url).searchParams.getAll(name)
      : IBaseRoute.toValues(validated[name])
          .map((entry: unknown): string | undefined => IBaseRoute.toQueryString(entry))
          .filter((entry: string | undefined): entry is string => entry !== undefined);
  }

  private static toValues(value: unknown): unknown[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
  }

  /**
   * Render a validated query value as the string handlers expect.
   *
   * Schemas coerce query values to numbers and booleans, so a handler reading
   * `string | undefined` needs them stringified. Anything that is not a
   * primitive yields `undefined` rather than `[object Object]`: query values
   * never legitimately parse to an object, and a schema that produced one is a
   * bug worth surfacing as a missing value rather than a garbage string.
   */
  private static toQueryString(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint' ? String(value) : undefined;
  }

  protected toErrorResponse(error: unknown, c: RouteContext<TEnv>) {
    // Typed service errors (including NotFoundError/DatabaseError and 5xx
    // domain errors) map to their own status/type/message with the original
    // cause preserved. Only untyped errors are masked as internal errors.
    if (error instanceof ServiceError) {
      if (error.getErrorCode() < 500) {
        logError('warn', `Responding with ${error.getErrorType()}`, error);
      } else {
        logError('error', `Responding with ${error.getErrorType()}`, error);
      }
      return c.json({ Exception: { Type: error.getErrorType(), Message: error.getErrorMessage() } }, error.getErrorCode());
    }
    logError('error', 'Caught service error during execution', error);
    return c.json(
      {
        Exception: {
          Type: DefaultInternalServerError.getErrorType(),
          Message: DefaultInternalServerError.getErrorMessage(),
        },
      },
      DefaultInternalServerError.getErrorCode(),
    );
  }
}

interface IRequest {
  raw: Request;
}

/**
 * Validated query parameters for the request currently being handled.
 *
 * Keyed on the synthesized request object rather than held as instance state:
 * Chanfana's route instances are not a documented per-request lifetime, so an
 * instance field could leak one user's query into another's request. The
 * `try`/`finally` in `handle` bounds each entry to a single `handleRequest`
 * call.
 */
const VALIDATED_QUERY: WeakMap<IRequest, Record<string, unknown>> = new WeakMap();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface IResponse {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface IEnv {}

interface ExtendedResponse<TResponse extends IResponse> {
  body?: TResponse;
  rawBody?: BodyInit | null;
  statusCode?: StatusCode;
  headers?: Record<string, string>;
}

type RouteContext<TEnv extends IEnv> = Context<{ Bindings: Env } & TEnv>;

export { IBaseRoute };
export type { ExtendedResponse, IEnv, IRequest, IResponse, RouteContext };
