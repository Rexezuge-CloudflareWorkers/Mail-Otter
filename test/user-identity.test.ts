import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserEmailRow, UserRow } from '@mail-otter/backend-data/dao';

/**
 * The invariant under test: an account's **id** — not its address — is what owns
 * its applications, context documents and actions, so moving the address moves
 * none of them.
 *
 * The DAO fakes below model the two structures the change introduces: a `users`
 * table with a frozen anchor plus a mutable `current_email`, and a `user_emails`
 * registry where `is_verified` gates login.
 */

const { mockUserDAO, mockUserEmailDAO, users, registry } = vi.hoisted(() => {
  interface FakeUserRow extends UserRow {
    id: string;
    email: string;
    current_email: string;
  }
  const users: FakeUserRow[] = [];
  const registry = new Map<string, UserEmailRow>();
  return {
    users,
    registry,
    mockUserDAO: {
      getById: vi.fn(),
      getByEmail: vi.fn(),
      getByCurrentEmail: vi.fn(),
      getRowByEmail: vi.fn(),
      setCurrentEmail: vi.fn(),
      createUser: vi.fn(),
    },
    mockUserEmailDAO: {
      get: vi.fn(),
      resolveVerified: vi.fn(),
      register: vi.fn(),
      revokeAllVerified: vi.fn(),
      listByUserId: vi.fn(),
    },
  };
});

vi.mock('@mail-otter/backend-data/dao', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mail-otter/backend-data/dao')>();
  return {
    ...actual,
    UserDAO: Object.assign(
      vi.fn(function () {
        return mockUserDAO;
      }),
      { newId: () => `usr_${'a'.repeat(32)}`, newAnchor: () => `anchor-${'b'.repeat(32)}@users.invalid` },
    ),
    UserEmailDAO: vi.fn(function () {
      return mockUserEmailDAO;
    }),
  };
});

import { UserIdentityService } from '@mail-otter/backend-services/identity';

const ALICE_ID = 'usr_11111111111111111111111111111111';
const ALICE_ANCHOR = 'alice@legacy.test';
const ALICE_NEW = 'alice.new@legacy.test';

interface SeedAccount {
  id: string;
  anchor: string;
  current: string;
}

function seed(accounts: SeedAccount[]): void {
  users.length = 0;
  registry.clear();
  for (const account of accounts) {
    users.push({ id: account.id, email: account.anchor, current_email: account.current, created_at: 0, updated_at: 0 });
    registry.set(account.current.toLowerCase(), {
      email: account.current.toLowerCase(),
      user_id: account.id,
      is_verified: 1,
      created_at: 0,
    });
  }
  mockUserDAO.getById.mockImplementation(async (id: string) => users.find((row) => row.id === id) ?? null);
  mockUserDAO.getByCurrentEmail.mockImplementation(
    async (email: string) => users.find((row) => row.current_email.toLowerCase() === email.toLowerCase()) ?? null,
  );
  mockUserDAO.getRowByEmail.mockImplementation(async (email: string) => users.find((row) => row.email === email) ?? null);
  mockUserDAO.getByEmail.mockImplementation(async (email: string) => {
    const row = users.find((candidate) => candidate.email === email);
    return row ? { email: row.email, preferredLanguage: null, createdAt: 0, updatedAt: 0 } : undefined;
  });
  mockUserDAO.setCurrentEmail.mockImplementation(async (id: string, email: string) => {
    const row = users.find((candidate) => candidate.id === id);
    if (row) row.current_email = email;
  });
  mockUserEmailDAO.get.mockImplementation(async (email: string) => registry.get(email.toLowerCase()) ?? null);
  mockUserEmailDAO.resolveVerified.mockImplementation(async (email: string) => {
    const row = registry.get(email.toLowerCase());
    return row && row.is_verified === 1 ? row : null;
  });
  mockUserEmailDAO.revokeAllVerified.mockImplementation(async (userId: string, except: string) => {
    for (const row of registry.values()) {
      if (row.user_id === userId && row.email !== except.toLowerCase()) row.is_verified = 0;
    }
  });
  // `register` refuses a verified row and re-points a revoked one, exactly as the
  // real DAO does.
  mockUserEmailDAO.register.mockImplementation(
    async ({ email, userId, isVerified }: { email: string; userId: string; isVerified: boolean }) => {
      const key = email.toLowerCase();
      const existing = registry.get(key);
      if (existing && existing.is_verified === 1) return 'already-claimed' as const;
      registry.set(key, { email: key, user_id: userId, is_verified: isVerified ? 1 : 0, created_at: 0 });
      return 'claimed' as const;
    },
  );
}

function service(): UserIdentityService {
  return new UserIdentityService(
    { DB: {} as D1Database },
    { userDAO: async () => mockUserDAO as never, userEmailDAO: async () => mockUserEmailDAO as never },
  );
}

describe('UserIdentityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seed([{ id: ALICE_ID, anchor: ALICE_ANCHOR, current: ALICE_ANCHOR }]);
  });

  it('resolves an address to the account id, the current address, and the frozen anchor', async () => {
    const account = await service().resolveAccount(ALICE_ANCHOR);
    expect(account).toEqual({ id: ALICE_ID, email: ALICE_ANCHOR, anchorEmail: ALICE_ANCHOR });
  });

  it('normalizes the address before resolving', async () => {
    const account = await service().resolveAccount('  ALICE@Legacy.Test  ');
    expect(account?.id).toBe(ALICE_ID);
  });

  it('never resolves a revoked address to the previous holder', async () => {
    // A released address must not keep authenticating whoever held it before —
    // falling through to a `users` lookup here would be an account takeover.
    const row = registry.get(ALICE_ANCHOR);
    if (row) row.is_verified = 0;
    expect(await service().resolveAccount(ALICE_ANCHOR)).toBeNull();
  });

  it('returns null for an unknown address', async () => {
    expect(await service().resolveAccount('nobody@legacy.test')).toBeNull();
  });

  it('keeps resolving the same address after the account changes it', async () => {
    // The point of the change: moving the address must not move the account.
    const identity = service();
    await identity.setPrimaryEmail(ALICE_ID, ALICE_NEW);

    const after = await identity.resolveAccount(ALICE_NEW);
    expect(after).toEqual({ id: ALICE_ID, email: ALICE_NEW, anchorEmail: ALICE_ANCHOR });
    // The anchor never moves: rewriting it is what would cascade the account's
    // rows away and orphan its Vectorize namespace.
    expect(users[0]?.email).toBe(ALICE_ANCHOR);
  });

  it('revokes the previous address without deleting it', async () => {
    await service().setPrimaryEmail(ALICE_ID, ALICE_NEW);
    // Retained so rows written before the change stay attributable...
    expect(registry.has(ALICE_ANCHOR)).toBe(true);
    // ...but no longer able to authenticate.
    expect(registry.get(ALICE_ANCHOR)?.is_verified).toBe(0);
    expect(registry.get(ALICE_NEW)?.is_verified).toBe(1);
  });

  it('refuses an address that is already a live login for another account', async () => {
    const BOB_ID = 'usr_22222222222222222222222222222222';
    const SHARED = 'shared@legacy.test';
    seed([
      { id: ALICE_ID, anchor: ALICE_ANCHOR, current: ALICE_ANCHOR },
      { id: BOB_ID, anchor: 'bob@legacy.test', current: SHARED },
    ]);
    // `shared@legacy.test` is bob's live sign-in address. Alice taking it would
    // hand bob's account to her, so the change is refused rather than applied.
    await expect(service().setPrimaryEmail(ALICE_ID, SHARED)).rejects.toThrow('already in use');
    expect(users[0]?.current_email).toBe(ALICE_ANCHOR);
    expect(registry.get(SHARED)?.user_id).toBe(BOB_ID);
  });

  it('is a no-op when the address is already current', async () => {
    const account = await service().setPrimaryEmail(ALICE_ID, ALICE_ANCHOR);
    expect(account).toEqual({ id: ALICE_ID, email: ALICE_ANCHOR, anchorEmail: ALICE_ANCHOR });
  });

  it('memoizes a resolution for the lifetime of the request scope', async () => {
    const identity = service();
    await identity.resolveAccount(ALICE_ANCHOR);
    await identity.resolveAccount(ALICE_ANCHOR);
    await identity.resolveAccount(ALICE_ANCHOR);
    // One lookup, not one per authorization check in the request.
    expect(mockUserEmailDAO.get).toHaveBeenCalledOnce();
  });

  it('resolves an account by its id, in the direction a stored key needs', async () => {
    const identity = service();
    await identity.setPrimaryEmail(ALICE_ID, ALICE_NEW);
    const byId = await identity.resolveUserById(ALICE_ID);
    expect(byId).toEqual({ id: ALICE_ID, email: ALICE_NEW, anchorEmail: ALICE_ANCHOR });
  });

  it('lists every address, verified first', async () => {
    const identity = service();
    await identity.setPrimaryEmail(ALICE_ID, ALICE_NEW);
    mockUserEmailDAO.listByUserId.mockImplementation(async (userId: string) =>
      [...registry.values()].filter((row) => row.user_id === userId),
    );
    const addresses = await identity.listAddresses(ALICE_ID);
    expect(addresses).toEqual(
      expect.arrayContaining([
        { email: ALICE_NEW, isVerified: true },
        { email: ALICE_ANCHOR, isVerified: false },
      ]),
    );
  });

  it('links a proven address without making it the sign-in address', async () => {
    await service().linkVerifiedEmail(ALICE_ID, 'alice.alias@legacy.test');
    expect(registry.get('alice.alias@legacy.test')?.user_id).toBe(ALICE_ID);
    // Linking is not promoting: the account still signs in with the old address.
    expect(users[0]?.current_email).toBe(ALICE_ANCHOR);
  });

  describe('construction and failure modes', () => {
    it('builds its own DAOs from the env when none are injected', async () => {
      // The standalone constructor has to work: `UserService` and the ops tooling
      // resolve it without a composition root. Driving a full resolution also
      // proves the default DAO factories are wired, not merely constructible.
      const standalone = new UserIdentityService({ DB: {} as D1Database });
      expect(await standalone.resolveAccount(ALICE_ANCHOR)).toEqual({
        id: ALICE_ID,
        email: ALICE_ANCHOR,
        anchorEmail: ALICE_ANCHOR,
      });
    });

    it('rejects a blank address instead of writing one', async () => {
      await expect(service().setPrimaryEmail(ALICE_ID, ' '.repeat(3))).rejects.toThrow('Invalid email address');
      await expect(service().linkVerifiedEmail(ALICE_ID, '  ')).rejects.toThrow('Invalid email address');
    });

    it('rejects a change for an account that does not exist', async () => {
      mockUserDAO.getById.mockResolvedValue(null);
      await expect(service().setPrimaryEmail('usr_missing', ALICE_NEW)).rejects.toThrow('User not found');
    });

    it('refuses to link an address another account already holds', async () => {
      mockUserEmailDAO.register.mockResolvedValue('already-claimed');
      await expect(service().linkVerifiedEmail(ALICE_ID, 'taken@legacy.test')).rejects.toThrow('already in use');
    });

    it('returns null for an id that resolves to no account', async () => {
      expect(await service().resolveUserById('usr_missing')).toBeNull();
    });

    it('wraps a DAO failure as a DatabaseError rather than leaking it', async () => {
      mockUserDAO.getById.mockRejectedValue(new Error('socket hang up'));
      await expect(service().resolveUserById(ALICE_ID)).rejects.toThrow(/Failed to resolve account/u);
    });

    it('wraps a failure to build the DAOs', async () => {
      const broken = new UserIdentityService(
        { DB: {} as D1Database },
        {
          userDAO: () => Promise.reject(new Error('no db')),
          userEmailDAO: async () => mockUserEmailDAO as never,
        },
      );
      await expect(broken.resolveAccount(ALICE_ANCHOR)).rejects.toThrow(/Failed to load identity/u);
    });
  });

  it('falls back to a `users` lookup on a database that has not run the migration', async () => {
    // Pre-0028 the address *is* the anchor and there is no registry at all.
    registry.clear();
    mockUserEmailDAO.get.mockRejectedValue(new Error('no such table: user_emails'));
    const account = await service().resolveAccount(ALICE_ANCHOR);
    expect(account?.id).toBe(ALICE_ID);
  });
});
