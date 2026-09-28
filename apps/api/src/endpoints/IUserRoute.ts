import { IBaseRoute } from './IBaseRoute';
import type { IEnv, IRequest, IResponse, RouteContext } from './IBaseRoute';
import type { AccountIdentity } from '@mail-otter/backend-services/identity';

abstract class IUserRoute<TRequest extends IRequest, TResponse extends IResponse, TEnv extends IUserEnv> extends IBaseRoute<
  TRequest,
  TResponse,
  TEnv
> {
  /**
   * The authenticated account.
   *
   * Pass this to any service that authorizes against a user-owned resource:
   * ownership matches on `id`, so an account keeps its mailboxes, context
   * documents and actions after changing address. `anchorEmail` is the frozen
   * value the legacy `*_email` columns and the Vectorize namespace hold — never
   * substitute the current address for it.
   */
  protected getAuthenticatedUser(c: RouteContext<TEnv>): AccountIdentity {
    return {
      id: c.get('AuthenticatedUserId'),
      email: c.get('AuthenticatedUserEmailAddress'),
      anchorEmail: c.get('AuthenticatedUserAnchorEmail'),
    };
  }

  /**
   * The address the account currently signs in with. Use for display and for the
   * account's own profile, not for ownership.
   */
  protected getAuthenticatedUserEmailAddress(c: RouteContext<TEnv>): string {
    return c.get('AuthenticatedUserEmailAddress');
  }
}

interface IUserEnv extends IEnv {
  Variables: {
    /**
    The stable account key — the only value that should identify a user.
    */
    AuthenticatedUserId: string;
    /**
    The current sign-in address, as presented to the user.
    */
    AuthenticatedUserEmailAddress: string;
    /**
    The frozen anchor: what legacy `*_email` columns and the vector namespace hold.
    */
    AuthenticatedUserAnchorEmail: string;
  };
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export { IUserRoute };
export type { IUserEnv };

export { type ExtendedResponse, type IRequest, type IResponse, type RouteContext } from './IBaseRoute';

export { type AccountIdentity } from '@mail-otter/backend-services/identity';
