import { OpenAPIRoute } from 'chanfana';
import { Context } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import { BadRequestError, DatabaseError, DefaultInternalServerError, ServiceError } from '@mail-otter/backend-errors';
import { validateRequestInput } from '@mail-otter/shared/schema';

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
      const response: TResponse | ExtendedResponse<TResponse> = await this.handleRequest(request, c.env as TEnv, c);
      return this.toResponse(response, c);
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
      if ('rawBody' in extendedResponse) {
        return c.body((extendedResponse.rawBody ?? null) as never);
      }
      return c.json(extendedResponse.body);
    }
    return c.json(response);
  }

  protected getQueryParam(request: IRequest, name: string): string | undefined {
    return new URL(request.raw.url).searchParams.get(name) ?? undefined;
  }

  protected toErrorResponse(error: unknown, c: RouteContext<TEnv>) {
    if (error instanceof ServiceError && error.getErrorCode() < 500) {
      console.warn(`Responding with ${error.getErrorType()}:`, error.stack);
      return c.json({ Exception: { Type: error.getErrorType(), Message: error.getErrorMessage() } }, error.getErrorCode());
    }
    if (error instanceof DatabaseError) {
      console.error('Caught database error during execution:', error);
      return c.json({ Exception: { Type: error.getErrorType(), Message: error.getErrorMessage() } }, error.getErrorCode());
    }
    console.error('Caught service error during execution:', error);
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
