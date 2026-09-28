import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The 0028 identity surface: the stable account key, the mutable sign-in
 * address, the address registry, and the one ownership predicate every
 * user-keyed query shares.
 *
 * The property worth protecting here is that the **frozen anchor is never
 * written**. `setCurrentEmail` must not touch `users.email`, and `createUser` must
 * only ever *adopt* an id-less row — never fork a second account beside one that
 * already has an id.
 */

const mockRun = vi.fn();
const mockFirst = vi.fn();
const mockAll = vi.fn();

import { UserDAO, UserEmailDAO, loginEmailOf, scopeForAnchor, userScopeSql, userScopeUpsertSql } from '@mail-otter/backend-data/dao';

/**
The SQL text handed to `db.prepare`, for the most recent call.
*/
function preparedSql(): string {
  return (createMockDbPrepareMock().mock.calls.at(-1)?.[0] ?? '') as string;
}

let prepareSpy: ReturnType<typeof vi.fn>;

function createMockDbPrepareMock(): ReturnType<typeof vi.fn> {
  return prepareSpy;
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockRun.mockReset().mockResolvedValue({ success: true });
  mockFirst.mockReset().mockResolvedValue(null);
  mockAll.mockReset().mockResolvedValue({ results: [] });
  prepareSpy = vi.fn(() => ({ bind: vi.fn(() => ({ run: mockRun, first: mockFirst, all: mockAll })) }));
});

function db(): Record<string, ReturnType<typeof vi.fn>> {
  return { prepare: prepareSpy, batch: vi.fn() };
}

describe('UserDAO identity columns', () => {
  describe('newId / newAnchor', () => {
    it('mints an opaque, prefixed account id', () => {
      const id = UserDAO.newId();
      expect(id).toMatch(/^usr_[0-9a-f]{32}$/);
      expect(UserDAO.newId()).not.toBe(id);
    });

    it('mints an anchor in a reserved domain that can never be a real address', () => {
      // The anchor is the primary key every legacy `*_email` foreign key resolves
      // against, so a real address used here could never be re-registered by a
      // different person after the original account moved off it.
      const anchor = UserDAO.newAnchor();
      expect(anchor).toMatch(/^anchor-[0-9a-f]{32}@users\.invalid$/);
    });
  });

  describe('loginEmailOf', () => {
    it('prefers the mutable sign-in address', () => {
      expect(loginEmailOf({ email: 'old@x.test', current_email: 'New@X.test', created_at: 0, updated_at: 0 })).toBe('new@x.test');
    });

    it('falls back to the anchor on a database that has not run 0028', () => {
      expect(loginEmailOf({ email: 'old@x.test', created_at: 0, updated_at: 0 })).toBe('old@x.test');
    });

    it('returns null for a missing row', () => {
      expect(loginEmailOf(null)).toBeNull();
    });
  });

  describe('createUser', () => {
    it('stamps the identity columns on insert', async () => {
      await new UserDAO(db()).createUser({ id: 'usr_1', anchor: 'a@x.test', loginEmail: 'a@x.test', now: 10 });
      const sql = preparedSql();
      expect(sql).toContain('INSERT INTO users (id, email, current_email, created_at, updated_at)');
      expect(sql).toContain('ON CONFLICT(email) DO UPDATE');
    });

    it('only ever adopts an id-less row, so it cannot fork a second account', async () => {
      // The `WHERE users.id IS NULL` guard is the whole safety property: a conflict
      // against a row that already has an account must be a no-op, or an address
      // change would leave two identities behind the same address.
      await new UserDAO(db()).createUser({ anchor: 'a@x.test', loginEmail: 'a@x.test', now: 10 });
      expect(preparedSql()).toContain('WHERE users.id IS NULL');
    });
  });

  describe('getById / getByCurrentEmail / getRowByEmail', () => {
    it('looks an account up by its stable key', async () => {
      mockFirst.mockResolvedValue({ id: 'usr_1', email: 'a@x.test', current_email: 'a@x.test' });
      const row = await new UserDAO(db()).getById('usr_1');
      expect(preparedSql()).toContain('WHERE id = ?');
      expect(row?.id).toBe('usr_1');
    });

    it('matches the sign-in address case-insensitively', async () => {
      await new UserDAO(db()).getByCurrentEmail('A@X.test');
      // Cloudflare Access does not promise a normalized claim and the registry is
      // keyed on the lowercased form, so the lookup must be too.
      expect(preparedSql()).toContain('lower(current_email) = lower(?)');
    });

    it('returns the full row for an anchor lookup', async () => {
      mockFirst.mockResolvedValue({ id: 'usr_1', email: 'a@x.test', current_email: 'b@x.test' });
      const row = await new UserDAO(db()).getRowByEmail('a@x.test');
      expect(preparedSql()).toContain('WHERE email = ?');
      expect(row?.current_email).toBe('b@x.test');
    });
  });

  describe('setCurrentEmail', () => {
    it('moves the sign-in address and never touches the frozen anchor', async () => {
      await new UserDAO(db()).setCurrentEmail('usr_1', 'New@X.test', 42);
      const sql = preparedSql();
      expect(sql).toContain('UPDATE users SET current_email = ?, updated_at = ? WHERE id = ?');
      // The one statement that must never appear: rewriting `users.email` would
      // cascade the account's applications and context documents out of the
      // database, and would orphan its Vectorize namespace.
      expect(sql).not.toMatch(/SET\s+email\b/u);
    });
  });
});

describe('UserEmailDAO', () => {
  describe('register', () => {
    it('claims a free address', async () => {
      const dao = new UserEmailDAO(db());
      expect(await dao.register({ email: 'A@X.test', userId: 'usr_1', isVerified: true, now: 1 })).toBe('claimed');
      expect(preparedSql()).toContain('INSERT INTO user_emails');
    });

    it('refuses to re-point a verified address', async () => {
      // Silently re-pointing would hand one account's identity to another.
      mockFirst.mockResolvedValue({ email: 'a@x.test', user_id: 'usr_other', is_verified: 1, created_at: 0 });
      const dao = new UserEmailDAO(db());
      expect(await dao.register({ email: 'a@x.test', userId: 'usr_1', isVerified: true, now: 1 })).toBe('already-claimed');
      // Only the lookup ran; the write was never issued.
      expect(preparedSql()).toContain('SELECT * FROM user_emails');
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('re-points a revoked address, releasing it for re-registration', async () => {
      mockFirst.mockResolvedValue({ email: 'a@x.test', user_id: 'usr_other', is_verified: 0, created_at: 0 });
      const dao = new UserEmailDAO(db());
      expect(await dao.register({ email: 'a@x.test', userId: 'usr_1', isVerified: true, now: 1 })).toBe('claimed');
      expect(preparedSql()).toContain('ON CONFLICT(email) DO UPDATE');
    });
  });

  describe('reads', () => {
    it('gets a registry row case-insensitively', async () => {
      await new UserEmailDAO(db()).get('A@X.test');
      expect(preparedSql()).toContain('FROM user_emails WHERE email = ?');
    });

    it('resolves only a verified address for login', async () => {
      await new UserEmailDAO(db()).resolveVerified('a@x.test');
      expect(preparedSql()).toContain('is_verified = 1');
    });

    it('lists an account’s addresses, verified first', async () => {
      mockAll.mockResolvedValue({ results: [{ email: 'a@x.test', user_id: 'usr_1', is_verified: 1, created_at: 0 }] });
      const rows = await new UserEmailDAO(db()).listByUserId('usr_1');
      expect(preparedSql()).toContain('ORDER BY is_verified DESC, created_at ASC');
      expect(rows).toHaveLength(1);
    });

    it('tolerates a missing result set', async () => {
      mockAll.mockResolvedValue({});
      expect(await new UserEmailDAO(db()).listByUserId('usr_1')).toEqual([]);
    });
  });

  describe('revocation', () => {
    it('revokes one address while keeping it resolvable for attribution', async () => {
      await new UserEmailDAO(db()).revoke('A@X.test');
      expect(preparedSql()).toContain('UPDATE user_emails SET is_verified = 0 WHERE email = ?');
    });

    it('revokes every other verified address so only the new one authenticates', async () => {
      await new UserEmailDAO(db()).revokeAllVerified('usr_1', 'New@X.test');
      expect(preparedSql()).toContain('WHERE user_id = ? AND email != ?');
    });
  });
});

describe('userScope', () => {
  it('matches on the id, falling back to the frozen anchor for a pre-0028 row', () => {
    const sql = userScopeSql({ id: 'usr_1', anchorEmail: 'a@x.test' });
    expect(sql.clause).toBe('(user_id = ? OR (user_id IS NULL AND user_email = ?))');
    expect(sql.bindings).toEqual(['usr_1', 'a@x.test']);
  });

  it('falls back to the address alone when no id is known', () => {
    const sql = userScopeSql({ id: null, anchorEmail: 'a@x.test' });
    expect(sql.clause).toBe('user_email = ?');
    expect(sql.bindings).toEqual(['a@x.test']);
  });

  it('qualifies the columns for a query that reaches the rows through a join', () => {
    expect(userScopeSql({ id: 'usr_1', anchorEmail: 'a@x.test' }, 'ca').clause).toContain('ca.user_id');
  });

  it('builds a scope for a caller that only holds a stored anchor', () => {
    expect(scopeForAnchor('a@x.test')).toEqual({ id: null, anchorEmail: 'a@x.test' });
  });

  it('keeps a previously stamped id when an upsert cannot resolve one', () => {
    // A caller that cannot resolve an id (a pre-0028 database, or an address
    // matching no account) must not wipe a good id.
    expect(userScopeUpsertSql('connected_applications')).toBe('user_id = COALESCE(excluded.user_id, connected_applications.user_id)');
  });
});
