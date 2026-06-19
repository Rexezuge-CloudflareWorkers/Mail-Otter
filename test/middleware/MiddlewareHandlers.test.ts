import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUserEmail = 'user@example.com';

vi.mock('@mail-otter/backend-services/auth', () => ({
  EmailValidationUtil: {
    getAuthenticatedUserEmail: vi.fn(),
  },
}));

vi.mock('@mail-otter/backend-data/dao', () => {
  function MockUserDAO() {
    this.upsertByEmail = vi.fn();
  }
  return { UserDAO: MockUserDAO };
});

import { MiddlewareHandlers } from '../../apps/api/src/middleware/MiddlewareHandlers';
import { EmailValidationUtil } from '@mail-otter/backend-services/auth';
import { UnauthorizedError } from '@mail-otter/backend-errors';
import type { Context } from 'hono';

describe('MiddlewareHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets AuthenticatedUserEmailAddress and calls next on success', async () => {
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

    expect(setFn).toHaveBeenCalledWith('AuthenticatedUserEmailAddress', mockUserEmail);
    expect(next).toHaveBeenCalledOnce();
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

    (EmailValidationUtil.getAuthenticatedUserEmail as ReturnType<typeof vi.fn>).mockRejectedValue(
      new UnauthorizedError('Invalid token'),
    );

    const handler = MiddlewareHandlers.userAuthentication();
    await handler(c, next);

    expect(jsonFn).toHaveBeenCalledWith(
      { Exception: { Type: 'Unauthorized', Message: 'Invalid token' } },
      401,
    );
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
