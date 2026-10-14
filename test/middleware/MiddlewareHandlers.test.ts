import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUserEmail = 'user@example.com';
const mockAccountId = 'usr_0123456789abcdef0123456789abcdef';

vi.mock('@rexezuge/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rexezuge/http')>();
  return { ...actual, authenticateAccess: vi.fn() };
});

/**
 * The pre-0028 shape is not enough to satisfy `UserService.upsertUser`, which now
 * resolves before it creates: it needs the id columns and the `user_emails`
 * registry. The fake below returns a fully migrated account so the middleware's
 * resolve-then-create path is exercised rather than bypassed.
 */
vi.mock('@mail-otter/backend-data/dao', () => {
  const account = {
    id: 'usr_0123456789abcdef0123456789abcdef',
    email: 'user@example.com',
    current_email: 'user@example.com',
  };
  function MockUserDAO() {
    this.getById = vi.fn().mockResolvedValue(account);
    this.getByCurrentEmail = vi.fn().mockResolvedValue(account);
    this.getRowByEmail = vi.fn().mockResolvedValue(account);
    this.getByEmail = vi.fn().mockResolvedValue({ ...account, preferredLanguage: null, createdAt: 1, updatedAt: 1 });
    this.getUser = vi.fn().mockResolvedValue({ ...account, preferredLanguage: null, createdAt: 1, updatedAt: 1 });
    this.createUser = vi.fn();
    this.setCurrentEmail = vi.fn();
  }
  function MockUserEmailDAO() {
    this.get = vi.fn().mockResolvedValue({ email: 'user@example.com', user_id: account.id, is_verified: 1, created_at: 1 });
    this.register = vi.fn().mockResolvedValue('claimed');
    this.resolveVerified = vi.fn().mockResolvedValue(null);
    this.listByUserId = vi.fn().mockResolvedValue([]);
    this.revoke = vi.fn();
    this.revokeAllVerified = vi.fn();
  }
  return {
    UserDAO: MockUserDAO,
    UserEmailDAO: MockUserEmailDAO,
    AiDailyUsageDAO: class {},
    scopeForAnchor: (anchorEmail: string) => ({ id: null, anchorEmail }),
    userScopeSql: (scope: { id: string | null; anchorEmail: string }) =>
      scope.id
        ? { clause: '(user_id = ? OR (user_id IS NULL AND user_email = ?))', bindings: [scope.id, scope.anchorEmail] }
        : { clause: 'user_email = ?', bindings: [scope.anchorEmail] },
  };
});

import { MiddlewareHandlers } from '../../apps/api/src/middleware/MiddlewareHandlers';
import { authenticateAccess } from '@rexezuge/http';
import { UnauthorizedError } from '@rexezuge/errors';
import type { Context } from 'hono';

/**
The mocked `authenticateAccess`, typed as a spy rather than through the kit's
real signature so the tests read as "authentication said X".
*/
function mockAuth(): ReturnType<typeof vi.fn> {
  return authenticateAccess as unknown as ReturnType<typeof vi.fn>;
}

function contextWith(env: Record<string, unknown>): Context {
  return {
    req: { raw: new Request('https://example.com/user/me') },
    env,
    set: vi.fn(),
  } as unknown as Context;
}

describe('MiddlewareHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('puts the resolved account identity in the request context', async () => {
    const setFn = vi.fn();
    const c = { ...contextWith({ DB: {} }), set: setFn } as unknown as Context;
    const next = vi.fn();

    mockAuth().mockResolvedValue(mockUserEmail);

    const handler = MiddlewareHandlers.userAuthentication();
    await handler(c, next);

    // The id is the identity; the current address is what the user sees; the
    // anchor is the frozen value legacy `*_email` columns and the Vectorize
    // namespace hold. A route that authorizes must use the first and third.
    expect(setFn).toHaveBeenCalledWith('AuthenticatedUserId', mockAccountId);
    expect(setFn).toHaveBeenCalledWith('AuthenticatedUserEmailAddress', mockUserEmail);
    expect(setFn).toHaveBeenCalledWith('AuthenticatedUserAnchorEmail', mockUserEmail);
    expect(next).toHaveBeenCalledOnce();
  });

  it('resolves through the registry so an address that already has an account cannot fork a second one', async () => {
    const setFn = vi.fn();
    const c = { ...contextWith({ DB: {} }), set: setFn } as unknown as Context;

    mockAuth().mockResolvedValue(mockUserEmail);

    const handler = MiddlewareHandlers.userAuthentication();
    await handler(c, vi.fn());

    // Exactly one id was ever put in the context, and it is the pre-existing
    // account's -- not a freshly minted one.
    const idCalls = setFn.mock.calls.filter(([key]) => key === 'AuthenticatedUserId');
    expect(idCalls).toHaveLength(1);
    expect(idCalls[0]?.[1]).toBe(mockAccountId);
  });

  it('returns error JSON when IServiceError is thrown', async () => {
    const jsonFn = vi.fn().mockReturnValue('error response');
    const c = { ...contextWith({}), set: vi.fn(), json: jsonFn } as unknown as Context;
    const next = vi.fn();

    mockAuth().mockRejectedValue(new UnauthorizedError('Invalid token'));

    const handler = MiddlewareHandlers.userAuthentication();
    await handler(c, next);

    expect(jsonFn).toHaveBeenCalledWith({ Exception: { Type: 'Unauthorized', Message: 'Invalid token' } }, 401);
    expect(next).not.toHaveBeenCalled();
  });

  it('re-throws non-IServiceError errors', async () => {
    const c = contextWith({});
    const next = vi.fn();

    const error = new Error('Unexpected error');
    mockAuth().mockRejectedValue(error);

    const handler = MiddlewareHandlers.userAuthentication();
    await expect(handler(c, next)).rejects.toThrow('Unexpected error');
    expect(next).not.toHaveBeenCalled();
  });

  describe('Access configuration', () => {
    /**
    Run the middleware once and return the options it handed the authenticator.
    */
    async function optionsFor(env: Record<string, unknown>): Promise<Record<string, unknown>> {
      mockAuth().mockResolvedValue(mockUserEmail);
      await MiddlewareHandlers.userAuthentication()(contextWith(env), vi.fn());
      return mockAuth().mock.calls[0]?.[2] as Record<string, unknown>;
    }

    it('hands the verifier the team domain and audience', async () => {
      const options = await optionsFor({ TEAM_DOMAIN: 'https://team.cloudflareaccess.com', POLICY_AUD: 'aud' });
      expect(options.teamDomain).toBe('https://team.cloudflareaccess.com');
      expect(options.policyAud).toBe('aud');
    });

    it('does not allow the dev bypass when DEV_AUTH_EMAIL is unset', async () => {
      // The allow-list is derived from the var rather than hard-coded, so local
      // development is unchanged -- but the decision is now a named line rather
      // than a side effect inside the resolver, which is what makes it reviewable.
      const options = await optionsFor({});
      expect(options.bypassAllowed).toBe(false);
      expect(options.devAuthEmail).toBeUndefined();
    });

    it('allows the dev bypass exactly when DEV_AUTH_EMAIL is set', async () => {
      const options = await optionsFor({ DEV_AUTH_EMAIL: 'dev@example.com' });
      expect(options.bypassAllowed).toBe(true);
      expect(options.devAuthEmail).toBe('dev@example.com');
    });
  });
});
