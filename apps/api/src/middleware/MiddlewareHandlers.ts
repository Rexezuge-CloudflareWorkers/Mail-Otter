import { ServiceError } from '@rexezuge/errors';
import { authenticateAccess, errorBody } from '@rexezuge/http';
import { Context, Next } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
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

/**
 * The `ACCESS` binding, which Cloudflare provisions for a Worker behind an
 * Access application and `wrangler types` therefore never emits.
 *
 * Declared so its absence is a *type* fact rather than a `cast` at the call site:
 * `authenticateAccess` treats an absent binding as "401", never as "allow".
 */
interface AccessEnv {
  ACCESS?: {
    getIdentity(): Promise<{ email?: string | null; emailVerified?: boolean | null; email_verified?: boolean | null } | undefined>;
  };
}

class MiddlewareHandlers {
  public static userAuthentication() {
    // eslint-disable-next-line unicorn/consistent-function-scoping
    return async (c: UserContext, next: Next): Promise<Response | void> => {
      const requestScope = createRequestScope(c.env);
      try {
        const userEmail: string = await MiddlewareHandlers.authenticate(c);
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
        if (error instanceof ServiceError && error.status < 500) {
          return c.json(errorBody(error), error.status as ContentfulStatusCode);
        }
        throw error;
      }
    };
  }

  /**
   * Identify the caller as a Cloudflare Access user.
   *
   * `@rexezuge/http`'s `authenticateAccess`, which replaces a local
   * `EmailValidationUtil`. Three things change, each worth having:
   *
   * **The dev bypass is an explicit allow-list, not the mere presence of a var.**
   * Before, setting `DEV_AUTH_EMAIL` disabled Access for that environment
   * unconditionally — which is precisely the shape of a mistake that reaches
   * production, where every request is one operator's mailbox. `bypassAllowed` is
   * derived from the var rather than hard-coded, so the affordance is unchanged
   * for local development, but the decision is now one named line rather than a
   * side effect inside the resolver.
   *
   * **A bypass address is validated and lowercased.** The old path returned
   * `DEV_AUTH_EMAIL` verbatim, so a malformed value flowed straight into
   * `upsertUser` and tried to register a garbage account. It also skipped the
   * lowercase normalisation every other email in the system is stored under.
   *
   * **Every JWT failure collapses to one message.** Before, the verifier's own
   * text was forwarded — "signature verification failed" versus "expired" tells an
   * unauthenticated caller precisely which part of a forged token they got right.
   */
  private static authenticate(c: UserContext): Promise<string> {
    const env: Env & AccessEnv = c.env;
    const devAuthEmail: string | undefined = env.DEV_AUTH_EMAIL;
    return authenticateAccess(c.req.raw, env.ACCESS, {
      bypassAllowed: Boolean(devAuthEmail),
      devAuthEmail,
      teamDomain: env.TEAM_DOMAIN,
      policyAud: env.POLICY_AUD,
    });
  }
}

export { MiddlewareHandlers };
