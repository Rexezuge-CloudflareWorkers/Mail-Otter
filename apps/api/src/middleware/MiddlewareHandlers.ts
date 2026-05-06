import { UserDAO } from '@/dao';
import { IServiceError } from '@/error';
import { EmailValidationUtil } from '@/utils';
import { Context, Next } from 'hono';

type UserContext = Context<{ Bindings: Env; Variables: { AuthenticatedUserEmailAddress: string } }>;

class MiddlewareHandlers {
  public static userAuthentication() {
    return async (c: UserContext, next: Next): Promise<Response | void> => {
      try {
        const userEmail: string = await EmailValidationUtil.getAuthenticatedUserEmail(c.req.raw, c.env);
        const userDAO: UserDAO = new UserDAO(c.env.DB);
        await userDAO.upsertByEmail(userEmail);
        c.set('AuthenticatedUserEmailAddress', userEmail);
        await next();
      } catch (error: unknown) {
        if (error instanceof IServiceError) {
          return c.json({ Exception: { Type: error.getErrorType(), Message: error.getErrorMessage() } }, error.getErrorCode());
        }
        throw error;
      }
    };
  }
}

export { MiddlewareHandlers };
