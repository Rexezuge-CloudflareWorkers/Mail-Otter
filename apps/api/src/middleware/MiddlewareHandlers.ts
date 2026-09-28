import { ServiceError } from '@mail-otter/backend-errors';
import { EmailValidationUtil } from '@mail-otter/backend-services/auth';
import { Context, Next } from 'hono';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';
import type { AccountIdentity } from '@mail-otter/backend-services/identity';

type UserContext = Context<{
  Bindings: Env;
  Variables: {
    AuthenticatedUserId: string;
    AuthenticatedUserEmailAddress: string;
    AuthenticatedUserAnchorEmail: string;
  };
}>;

class MiddlewareHandlers {
  public static userAuthentication() {
    // eslint-disable-next-line unicorn/consistent-function-scoping
    return async (c: UserContext, next: Next): Promise<Response | void> => {
      const requestScope = createRequestScope(c.env);
      try {
        const userEmail: string = await EmailValidationUtil.getAuthenticatedUserEmail(c.req.raw, c.env);
        // Resolve-then-create: an address that already belongs to an account can
        // never mint a second one, which is what makes an address change safe.
        const identity: AccountIdentity = await requestScope.get(Tokens.UserService).upsertUser(userEmail);
        // The account id is the identity; the current address is what the user
        // sees; the anchor is the frozen value legacy `*_email` columns and the
        // Vectorize namespace depend on.
        c.set('AuthenticatedUserId', identity.id);
        c.set('AuthenticatedUserEmailAddress', identity.email);
        c.set('AuthenticatedUserAnchorEmail', identity.anchorEmail);
        await next();
      } catch (error: unknown) {
        if (error instanceof ServiceError && error.getErrorCode() < 500) {
          return c.json({ Exception: { Type: error.getErrorType(), Message: error.getErrorMessage() } }, error.getErrorCode());
        }
        throw error;
      }
    };
  }
}

export { MiddlewareHandlers };
