import { ServiceError } from '@mail-otter/backend-errors';
import { EmailValidationUtil } from '@mail-otter/backend-services/auth';
import { UserService } from '@mail-otter/backend-services/user';
import { Context, Next } from 'hono';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

type UserContext = Context<{ Bindings: Env; Variables: { AuthenticatedUserEmailAddress: string } }>;

class MiddlewareHandlers {
  public static userAuthentication() {
    // eslint-disable-next-line unicorn/consistent-function-scoping
    return async (c: UserContext, next: Next): Promise<Response | void> => {
      const scope = createRequestScope(c.env);
      try {
        const userEmail: string = await EmailValidationUtil.getAuthenticatedUserEmail(c.req.raw, c.env);
        await scope.get(Tokens.UserService).upsertUser(userEmail);
        c.set('AuthenticatedUserEmailAddress', userEmail);
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
