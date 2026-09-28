import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUserEmail = 'user@example.com';
const mockAccountId = 'usr_0123456789abcdef0123456789abcdef';

vi.mock('@mail-otter/backend-services/auth', () => ({
  EmailValidationUtil: {
    getAuthenticatedUserEmail: vi.fn(),
  },
}));

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
    this.upsertByEmail = vi.fn();
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
import { EmailValidationUtil } from '@mail-otter/backend-services/auth';
import { UnauthorizedError } from '@mail-otter/backend-errors';
import type { Context } from 'hono';

describe('MiddlewareHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('puts the resolved account identity in the request context', async () => {
    const setFn = vi.fn();
    const c = {
      req: { raw: new Request('https://example.com/user/me') },
      env: { DB: {} },
      set: setFn,
    } as unknown as Context;
    const next = vi.fn();

    (EmailValidationUtil.getAuthenticatedUserEmail as ReturnType<typeof vi.fn>).mockResolvedValue(mockUserEmail);

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
    const c = {
      req: { raw: new Request('https://example.com/user/me') },
      env: { DB: {} },
      set: setFn,
    } as unknown as Context;

    (EmailValidationUtil.getAuthenticatedUserEmail as ReturnType<typeof vi.fn>).mockResolvedValue(mockUserEmail);

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
    const c = {
      req: { raw: new Request('https://example.com/user/me') },
      env: {},
      set: vi.fn(),
      json: jsonFn,
    } as unknown as Context;
    const next = vi.fn();

    (EmailValidationUtil.getAuthenticatedUserEmail as ReturnType<typeof vi.fn>).mockRejectedValue(new UnauthorizedError('Invalid token'));

    const handler = MiddlewareHandlers.userAuthentication();
    await handler(c, next);

    expect(jsonFn).toHaveBeenCalledWith({ Exception: { Type: 'Unauthorized', Message: 'Invalid token' } }, 401);
    expect(next).not.toHaveBeenCalled();
  });

  it('re-throws non-IServiceError errors', async () => {
    const c = {
      req: { raw: new Request('https://example.com/user/me') },
      env: {},
      set: vi.fn(),
    } as unknown as Context;
    const next = vi.fn();

    const error = new Error('Unexpected error');
    (EmailValidationUtil.getAuthenticatedUserEmail as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const handler = MiddlewareHandlers.userAuthentication();
    await expect(handler(c, next)).rejects.toThrow('Unexpected error');
    expect(next).not.toHaveBeenCalled();
  });
});
