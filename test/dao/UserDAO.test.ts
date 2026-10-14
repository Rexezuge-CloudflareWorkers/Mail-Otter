import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserDAO } from '@mail-otter/backend-data/dao';

/**
 * `UserDAO` is now the kit's class extended by this repo, which moved two things:
 * `upsertByEmail` (the pre-0028 insert shape, retired — `createUser` covers it)
 * and the camelCased `getByEmail` return (now `getUser`, so the two are not
 * confused with the kit's row-shaped `getByEmail`).
 *
 * The identity columns themselves are asserted in `UserIdentity.test.ts`, and the
 * username handle is the kit's to test.
 */

const mockRun = vi.fn();
const mockFirst = vi.fn();
let mockPrepare: ReturnType<typeof vi.fn>;
const mockBind = vi.fn();

/**
The SQL text handed to `db.prepare`, in order.

The sql-first `BaseDAO` takes SQL as a `run`/`first` argument and passes it to
`prepare` itself, so the statement text is observed there rather than on the
statement handle's `run`/`first` mocks.
*/
function preparedSqlAll(): string[] {
  return mockPrepare.mock.calls.map((call: unknown[]) => String(call[0]));
}

/**
The values bound to the most recent statement, in order.
*/
function boundValues(): unknown[] {
  return (mockBind.mock.calls.at(-1)?.[0] as unknown[]) ?? [];
}

function createMockDb(): Record<string, ReturnType<typeof vi.fn>> {
  mockPrepare = vi.fn(() => ({
    bind: vi.fn((...values: unknown[]) => {
      mockBind(...values);
      return { run: mockRun, first: mockFirst };
    }),
  }));
  return { prepare: mockPrepare, batch: vi.fn() };
}

describe('UserDAO', () => {
  let dao: UserDAO;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockRun.mockReset().mockResolvedValue({ success: true });
    mockFirst.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    dao = new UserDAO(createMockDb());
  });

  describe('getUser', () => {
    it('returns the user when found', async () => {
      mockFirst.mockResolvedValue({ email: 'existing@example.com', preferred_language: 'de', created_at: 1000, updated_at: 2000 });
      const user = await dao.getUser('existing@example.com');
      expect(user).toEqual({ email: 'existing@example.com', preferredLanguage: 'de', createdAt: 1000, updatedAt: 2000 });
    });

    it('maps the stored language preference', async () => {
      mockFirst.mockResolvedValue({ email: 'existing@example.com', preferred_language: 'de', created_at: 1, updated_at: 2 });
      const user = await dao.getUser('existing@example.com');
      expect(user?.preferredLanguage).toBe('de');
    });

    it('defaults the language preference to null when unset', async () => {
      mockFirst.mockResolvedValue({ email: 'existing@example.com', preferred_language: null, created_at: 1, updated_at: 2 });
      const user = await dao.getUser('existing@example.com');
      expect(user?.preferredLanguage).toBeNull();
    });

    it('returns null when there is no row', async () => {
      // `null`, not `undefined`. The kit's convention is that absence is `null`
      // all the way from `D1Result.first<T>()` up, so a caller never has to
      // check both.
      mockFirst.mockResolvedValue(null);
      expect(await dao.getUser('nobody@example.com')).toBeNull();
    });
  });

  describe('updatePreferredLanguage', () => {
    it('writes the preference and reads the row back', async () => {
      mockFirst.mockResolvedValue({ email: 'existing@example.com', preferred_language: 'ja', created_at: 1, updated_at: 2 });
      const user = await dao.updatePreferredLanguage('existing@example.com', 'ja');

      expect(preparedSqlAll().at(0) ?? '').toContain('UPDATE users SET preferred_language = ?');
      expect(user?.preferredLanguage).toBe('ja');
    });

    it('writes against the frozen anchor, not the sign-in address', async () => {
      // A language preference belongs to the account. Matching on
      // `current_email` would silently move it whenever the address changed.
      mockFirst.mockResolvedValue({ email: 'anchor@users.invalid', preferred_language: 'fr', created_at: 1, updated_at: 2 });
      await dao.updatePreferredLanguage('anchor@users.invalid', 'fr');
      // The bindings, in order: the preference, the timestamp, then the anchor the
      // row is matched on.
      expect(boundValues()).toContain('anchor@users.invalid');
    });

    it('clears the preference when given null', async () => {
      mockFirst.mockResolvedValue({ email: 'existing@example.com', preferred_language: null, created_at: 1, updated_at: 2 });
      const user = await dao.updatePreferredLanguage('existing@example.com', null);
      expect(user?.preferredLanguage).toBeNull();
    });
  });
});
