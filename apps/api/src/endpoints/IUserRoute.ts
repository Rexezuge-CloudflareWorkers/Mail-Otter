import { IBaseRoute } from './IBaseRoute';
import type { IEnv, IRequest, IResponse, RouteContext, ExtendedResponse } from './IBaseRoute';

abstract class IUserRoute<TRequest extends IRequest, TResponse extends IResponse, TEnv extends IUserEnv> extends IBaseRoute<
  TRequest,
  TResponse,
  TEnv
> {
  protected getAuthenticatedUserEmailAddress(c: RouteContext<TEnv>): string {
    return c.get('AuthenticatedUserEmailAddress');
  }
}

interface IUserEnv extends IEnv {
  Variables: {
    AuthenticatedUserEmailAddress: string;
  };
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export { IUserRoute };
export type { ExtendedResponse, IUserEnv, IRequest, IResponse, RouteContext };
