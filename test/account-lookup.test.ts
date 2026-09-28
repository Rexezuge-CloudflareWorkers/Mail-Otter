import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The shared address -> account resolution used by `UserService`.
 *
 * It is the bootstrap path, so it has to work on a database that has not run
 * migration 0028 (no registry, no id) as well as on one that has. These tests use
 * injected fakes rather than D1, which is also what exercises the defensive
 * `typeof … === 'function'` guards that keep a pre-0028 call site working.
 */

const { mockUserDAO, mockUserEmailDAO, users, registry } = vi.hoisted(() => {
  const users: Array<{ id: string | null; email: string; current_email: string | null }> = [];
  const registry = new Map<string, { email: string; user_id: string; is_verified: number; created_at: number }>();
  return {
    users,
    registry,
    mockUserDAO: {
      createUser: vi.fn(),
      upsertByEmail: vi.fn(),
      getById: vi.fn(),
      getByCurrentEmail: vi.fn(),
      getRowByEmail: vi.fn(),
    },
    mockUserEmailDAO: { get: vi.fn(), register: vi.fn() },
  };
});

import { registerAccount, resolveAccount, resolveUserId } from '@mail-otter/backend-services/user/accountLookup';

const deps = {
  userDAO: async () => mockUserDAO as never,
  userEmailDAO: async () => mockUserEmailDAO as never,
};

beforeEach(() => {
  vi.clearAllMocks();
  users.length = 0;
  registry.clear();
  mockUserDAO.getById.mockImplementation(async (id: string) => users.find((row) => row.id === id) ?? null);
  mockUserDAO.getByCurrentEmail.mockImplementation(async (email: string) => users.find((row) => row.current_email === email) ?? null);
  mockUserDAO.getRowByEmail.mockImplementation(async (email: string) => users.find((row) => row.email === email) ?? null);
  mockUserEmailDAO.get.mockImplementation(async (email: string) => registry.get(email) ?? null);
  mockUserEmailDAO.register.mockImplementation(
    async ({ email, userId, isVerified }: { email: string; userId: string; isVerified: boolean }) => {
      registry.set(email, { email, user_id: userId, is_verified: isVerified ? 1 : 0, created_at: 0 });
      return 'claimed' as const;
    },
  );
  mockUserDAO.createUser.mockImplementation(async ({ id, anchor, loginEmail }: { id: string; anchor: string; loginEmail: string }) => {
    const existing = users.find((row) => row.email === anchor);
    if (existing) {
      // Mirrors the real `ON CONFLICT … WHERE users.id IS NULL` adoption.
      existing.id ??= id;
      existing.current_email ??= loginEmail;
      return;
    }
    users.push({ id, email: anchor, current_email: loginEmail });
  });
});

describe('accountLookup', () => {
  describe('resolveAccount', () => {
    it('resolves through the registry to the stable id', async () => {
      users.push({ id: 'usr_1', email: 'a@x.test', current_email: 'a@x.test' });
      registry.set('a@x.test', { email: 'a@x.test', user_id: 'usr_1', is_verified: 1, created_at: 0 });
      expect(await resolveAccount(deps, 'A@X.test')).toEqual({ id: 'usr_1', email: 'a@x.test', anchorEmail: 'a@x.test' });
    });

    it('refuses a revoked address rather than falling through to the anchor lookup', async () => {
      users.push({ id: 'usr_1', email: 'a@x.test', current_email: 'a@x.test' });
      registry.set('a@x.test', { email: 'a@x.test', user_id: 'usr_1', is_verified: 0, created_at: 0 });
      // Falling through here would let a reassigned address keep authenticating
      // the previous holder's account.
      expect(await resolveAccount(deps, 'a@x.test')).toBeNull();
    });

    it('returns null when the registry points at an account that no longer exists', async () => {
      registry.set('a@x.test', { email: 'a@x.test', user_id: 'usr_gone', is_verified: 1, created_at: 0 });
      expect(await resolveAccount(deps, 'a@x.test')).toBeNull();
    });

    it('resolves on a pre-0028 database where the address is the anchor', async () => {
      users.push({ id: 'usr_1', email: 'a@x.test', current_email: null });
      mockUserEmailDAO.get.mockRejectedValue(new Error('no such table: user_emails'));
      expect(await resolveAccount(deps, 'a@x.test')).toEqual({ id: 'usr_1', email: 'a@x.test', anchorEmail: 'a@x.test' });
    });

    it('returns null for an id-less legacy row, so registration adopts it instead of forking', async () => {
      // A row written before the backfill has no id. Reporting an identity without
      // one is impossible, so this must return null and let `registerAccount`
      // adopt the row rather than mint a second account beside it.
      users.push({ id: null, email: 'a@x.test', current_email: null });
      expect(await resolveAccount(deps, 'a@x.test')).toBeNull();
    });

    it('rejects a blank address', async () => {
      expect(await resolveAccount(deps, ' '.repeat(3))).toBeNull();
    });
  });

  describe('resolveUserId', () => {
    it('returns the id, or null when the address is unknown', async () => {
      users.push({ id: 'usr_1', email: 'a@x.test', current_email: 'a@x.test' });
      expect(await resolveUserId(deps, 'a@x.test')).toBe('usr_1');
      expect(await resolveUserId(deps, 'nobody@x.test')).toBeNull();
    });
  });

  describe('registerAccount', () => {
    it('creates the account and claims its sign-in address', async () => {
      const account = await registerAccount(deps, 'new@x.test', 'new@x.test', 42);
      expect(account).not.toBeNull();
      expect(users).toHaveLength(1);
      expect(registry.get('new@x.test')?.user_id).toBe(users[0]?.id);
    });

    it('adopts an id-less legacy row instead of forking a second account', async () => {
      users.push({ id: null, email: 'a@x.test', current_email: null });
      const account = await registerAccount(deps, 'a@x.test', 'a@x.test', 42);
      expect(users).toHaveLength(1);
      expect(account?.id).toBe(users[0]?.id);
    });

    it('falls back to the pre-0028 insert shape when the DAO has no createUser', async () => {
      // A pre-0028 database has neither the identity columns nor the registry,
      // so the legacy insert is used and the anchor — which is the address — is
      // what resolves the account.
      mockUserEmailDAO.get.mockRejectedValue(new Error('no such table: user_emails'));
      mockUserEmailDAO.register.mockRejectedValue(new Error('no such table: user_emails'));
      const legacyDAO = {
        ...mockUserDAO,
        createUser: undefined,
        upsertByEmail: vi.fn(async (email: string) => {
          users.push({ id: null, email, current_email: null });
        }),
      };
      const account = await registerAccount({ ...deps, userDAO: async () => legacyDAO as never }, 'a@x.test', 'a@x.test', 1);
      expect(legacyDAO.upsertByEmail).toHaveBeenCalledWith('a@x.test');
      // Without an id there is no identity to report, so the caller retries.
      expect(account).toBeNull();
    });

    it('reports failure so the caller can retry with a different anchor', async () => {
      mockUserDAO.createUser.mockRejectedValue(new Error('db down'));
      await expect(registerAccount(deps, 'a@x.test', 'a@x.test', 1)).rejects.toThrow('db down');
    });

    it('still registers on a database with no address registry', async () => {
      mockUserEmailDAO.get.mockRejectedValue(new Error('no such table: user_emails'));
      const account = await registerAccount(deps, 'a@x.test', 'a@x.test', 1);
      // The anchor is the address, so the account is still resolvable.
      expect(account?.anchorEmail).toBe('a@x.test');
    });
  });
});
