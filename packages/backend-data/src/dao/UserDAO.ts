import { UserDAO as KitUserDAO } from '@rexezuge/identity';
import type { UserRow as KitUserRow } from '@rexezuge/identity';
import { TimestampUtil } from '@mail-otter/shared/utils';
import type { User, UserInternal } from '@mail-otter/shared/model';

/**
 * The kit's `users` DAO, plus this repo's two departures.
 *
 * ## Why this is a subclass rather than a re-export
 *
 * `users` in this database carries a column the kit's DAO does not model:
 * `preferred_language` (migration 0026), which is a **user-facing setting** —
 * `PUT /user/me` writes it, the SPA's language selector reads it back, and
 * `ChatService` resolves the assistant's reply locale from it. Dropping the
 * column to match the kit would be a product regression, not a convergence.
 *
 * So the column stays, this DAO stays, and everything the kit already got right
 * is inherited rather than copied: the username handle (`ensureUsername`,
 * `setUsername`, `getByUsernameCi`), the lowercase-parameter rule, and the
 * `null`-not-`undefined` reads.
 *
 * ## Why `createUser` is overridden rather than inherited
 *
 * The kit's version is `INSERT … ON CONFLICT DO NOTHING` plus a read-back that
 * returns `null` when the anchor was already taken, which is its signal to retry
 * with an opaque anchor. This repo also has to survive a database that predates
 * migration 0028, where a `users` row exists with `id IS NULL` and no
 * `current_email` — and D1 cannot alter a column's nullability, so those rows
 * exist in every deployment that predates the migration.
 *
 * `ON CONFLICT DO NOTHING` would treat such a row as a *conflicting* row and
 * silently create nothing, and the read-back would then return `null`, and
 * registration would retry with a fresh opaque anchor — minting a **second
 * account beside the first** and orphaning every id-keyed row behind the
 * original. The `DO UPDATE … WHERE users.id IS NULL` clause below means a
 * conflict only ever *adopts* an id-less row, so this path can never fork a
 * second identity for an address that already has one.
 */

/**
 * A row of the `users` table.
 *
 * `email` is the frozen anchor introduced by migration 0028: the PRIMARY KEY,
 * the target of every legacy `FOREIGN KEY (user_email) REFERENCES users(email)`,
 * and the input to the Vectorize namespace. It is never updated. `id` is the
 * stable account key and `current_email` the mutable sign-in address.
 *
 * `id` and `current_email` are optional because this DAO has to tolerate a
 * database that has not run 0028 yet; see `UserIdentityService.load`.
 */
interface UserRow extends KitUserRow {
  id?: string | null;
  current_email?: string | null;
  preferred_language?: string | null;
}

/**
 * The address an account signs in with: the mutable one, falling back to the
 * anchor on a database that has not run 0028.
 */
function loginEmailOf(row: UserRow | null | undefined): string | null {
  return row ? (row.current_email ?? row.email).toLowerCase() : null;
}

class UserDAO extends KitUserDAO {
  /**
   * Create or adopt an account.
   *
   * Returns the account's id, or `null` when the insert was a no-op — the
   * anchor was already held by a *real* account. That is the kit's contract, and
   * keeping it is what lets `@rexezuge/identity`'s `registerAccount` drive this
   * DAO unchanged: `null` is its signal to retry with a fresh opaque anchor.
   *
   * The read-back is load-bearing rather than defensive, and it distinguishes two
   * outcomes that look identical if you only inspect the write:
   *
   * - we inserted, or we *adopted* a legacy `users.id IS NULL` row, so the id now
   *   at the anchor is the one we supplied;
   * - the anchor is held by an existing account with a real id, so the
   *   `WHERE users.id IS NULL` clause refused the update and nothing happened.
   *
   * Trusting the generated id in the second case would point the address
   * registry at a phantom account that resolves to nothing, and the retry would
   * then fail the same way — stranding the address permanently.
   */
  public override async createUser(input: { id?: string | null; anchor: string; loginEmail: string; now: number }): Promise<string | null> {
    const id: string = input.id ?? newId();
    await this.run(
      'INSERT INTO users (id, email, current_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET id = COALESCE(users.id, excluded.id), current_email = COALESCE(users.current_email, excluded.current_email), updated_at = excluded.updated_at WHERE users.id IS NULL',
      [id, input.anchor, input.loginEmail, input.now, input.now],
    );
    const row: UserRow | null = await this.getByEmail(input.anchor);
    return row?.id === id ? id : null;
  }

  /**
   * Full-row anchor lookup, including the columns the kit's DAO does not model.
   *
   * The kit's `getByEmail` returns its own `UserRow`, which has no
   * `preferred_language`, so the language readers below need their own select.
   * This is also the only path that sees `id IS NULL` rows, because the kit's
   * reads are written against the post-0028 shape.
   */
  public async getRowByEmail(email: string): Promise<UserRow | null> {
    return this.first<UserRow>('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  }

  /**
   * Sign-in address lookup, case-insensitive.
   *
   * The kit's own version is `current_email = ?` on a lowercased parameter. This
   * one keeps `lower(current_email) = lower(?)`, which the kit deliberately does
   * not: `lower(col)` makes the index unusable. The difference is that this
   * database has `current_email` values written raw by the pre-0028 backfill, so
   * a mixed-case row exists and an index-seek-only read would miss it. This is
   * the one read where correctness beats the index.
   */
  public override async getByCurrentEmail(email: string): Promise<UserRow | null> {
    return this.first<UserRow>('SELECT * FROM users WHERE lower(current_email) = lower(?) LIMIT 1', [email]);
  }

  /**
   * The stored address as the rest of the app sees it, plus the columns this
   * repo owns.
   *
   * Separate from the kit's `getByEmail` because the shapes differ: this returns
   * the camelCased `User` the routes and SPA already consume.
   */
  public async getUser(email: string): Promise<User | null> {
    const row: UserInternal | null = await this.first<UserInternal>(
      'SELECT email, preferred_language, created_at, updated_at FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    return row ? this.toUser(row) : null;
  }

  /**
   * Set the reply locale for an account.
   *
   * Matched on the frozen anchor, not `current_email`: a language preference
   * belongs to the account, and an address change must not silently move it.
   */
  public async updatePreferredLanguage(email: string, preferredLanguage: string | null): Promise<User | null> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run('UPDATE users SET preferred_language = ?, updated_at = ? WHERE email = ?', [preferredLanguage, now, email]);
    return this.getUser(email);
  }

  private toUser(row: UserInternal): User {
    return {
      email: row.email,
      preferredLanguage: row.preferred_language ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * Build the opaque id of a new account. 128 bits of WebCrypto randomness, which
 * is what makes the id unguessable as well as unique.
 *
 * The kit has its own `newAccountId` (a `randomUUID`), but the format matters
 * here: `usr_`-prefixed ids are what migration 0028 backfilled, so a
 * differently-shaped id would be visible in every existing row's neighbourhood.
 */
function newId(): string {
  const random: string = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte: number): string => byte.toString(16).padStart(2, '0'))
    .join('');
  return `usr_${random}`;
}

/**
 * Build the opaque anchor of a new account.
 *
 * Only used when the sign-in address is already held as another account's
 * anchor, i.e. its previous holder moved off it. The anchor column is the
 * primary key every legacy `*_email` foreign key resolves against, so an address
 * used here could never be re-registered by a different person afterwards —
 * which is why this is a reserved, non-resolvable domain rather than a real
 * address. The anchor is the address itself whenever it is free, so this is the
 * uncommon path.
 */
function newAnchor(): string {
  const random: string = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte: number): string => byte.toString(16).padStart(2, '0'))
    .join('');
  return `anchor-${random}@users.invalid`;
}

export { loginEmailOf, newAnchor, newId, UserDAO };
export type { UserRow };
