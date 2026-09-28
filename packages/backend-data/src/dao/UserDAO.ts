import { DatabaseError } from '@mail-otter/backend-errors';
import { executeD1WithRetry } from '../utils';
import type { User, UserInternal } from '@mail-otter/shared/model';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';

/**
 * A row of the `users` table.
 *
 * `email` is the frozen anchor introduced by migration 0028: it is the PRIMARY
 * KEY, the target of every legacy `FOREIGN KEY (user_email) REFERENCES
 * users(email)`, and the input to the Vectorize namespace. It is never updated.
 * `id` is the stable account key and `current_email` the mutable sign-in
 * address.
 *
 * `id` and `current_email` are optional because this DAO has to tolerate a
 * database that has not run 0028 yet; see `UserIdentityService.load`.
 */
interface UserRow extends UserInternal {
  id?: string | null;
  current_email?: string | null;
}

/**
 * Build the opaque id of a new account. 128 bits of WebCrypto randomness, which
 * is what makes the id unguessable as well as unique.
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
 * used here could never be re-registered by a different person afterwards --
 * which is why this is a reserved, non-resolvable domain rather than a real
 * address. `registerAccount` prefers the address itself as the anchor whenever
 * it is free, so this is the uncommon path.
 */
function newAnchor(): string {
  const random: string = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte: number): string => byte.toString(16).padStart(2, '0'))
    .join('');
  return `anchor-${random}@users.invalid`;
}

/**
 * The address an account signs in with: the mutable one, falling back to the
 * anchor on a database that has not run 0028.
 */
function loginEmailOf(row: UserRow | null | undefined): string | null {
  return row ? (row.current_email ?? row.email).toLowerCase() : null;
}

class UserDAO extends BaseDAO {
  /**
   * Mint a stable account id. Exposed as a static so the registration path and
   * the ops script share one generator.
   */
  public static newId(): string {
    return newId();
  }

  /**
   * Mint an opaque frozen anchor. See {@link newAnchor} for why this is needed.
   */
  public static newAnchor(): string {
    return newAnchor();
  }

  public async upsertByEmail(email: string): Promise<User> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO users (email, created_at, updated_at)
              VALUES (?, ?, ?)
              ON CONFLICT(email) DO UPDATE SET updated_at = excluded.updated_at
            `,
          )
          .bind(email, now, now)
          .run(),
      'upsert user',
    );
    const user: User | undefined = await this.getByEmail(email);
    if (!user) {
      throw new DatabaseError('Failed to load user after upsert.');
    }
    return user;
  }

  /**
   * Anchor lookup. Pre-0028 this was the only way to find a user, and it is
   * still the only way to resolve a frozen anchor.
   */
  public async getByEmail(email: string): Promise<User | undefined> {
    const row: UserInternal | null = await this.database
      .prepare('SELECT email, preferred_language, created_at, updated_at FROM users WHERE email = ? LIMIT 1')
      .bind(email)
      .first<UserInternal>();
    return row ? this.toUser(row) : undefined;
  }

  public async updatePreferredLanguage(email: string, preferredLanguage: string | null): Promise<User | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('UPDATE users SET preferred_language = ?, updated_at = ? WHERE email = ?')
          .bind(preferredLanguage, now, email)
          .run(),
      'update user language',
    );
    return this.getByEmail(email);
  }

  /**
   * Insert an account, stamping the 0028 identity columns.
   *
   * The `ON CONFLICT ... DO UPDATE ... WHERE users.id IS NULL` clause means a
   * conflict only ever *adopts* a row that has no id yet, so this can never fork
   * a second identity for an address that already has a real account.
   *
   * That adoption case is not hypothetical. A `users` row written before 0028 — or
   * by a backfill that only knew the legacy columns — has `id IS NULL`, and
   * `resolveAccount` cannot return an identity without an id. Without adoption,
   * registration would treat the address as unknown and mint a *second* account
   * beside the first, orphaning every id-keyed row behind the original. Adoption
   * gives the existing row its id and keeps the history attached.
   */
  public async createUser(input: { id?: string | null; anchor: string; loginEmail: string; now: number }): Promise<void> {
    const id: string = input.id ?? newId();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `INSERT INTO users (id, email, current_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET
               id = COALESCE(users.id, excluded.id),
               current_email = COALESCE(users.current_email, excluded.current_email),
               updated_at = excluded.updated_at
             WHERE users.id IS NULL`,
          )
          .bind(id, input.anchor, input.loginEmail, input.now, input.now)
          .run(),
      'create user',
    );
  }

  /**
   * Anchor lookup, returning the full row including the identity columns.
   */
  public async getRowByEmail(email: string): Promise<UserRow | null> {
    return this.database.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').bind(email).first<UserRow>();
  }

  /**
   * Sign-in address lookup. Case-insensitive, because Cloudflare Access does not
   * promise a normalized claim and the registry is keyed on the lowercased form.
   */
  public async getByCurrentEmail(email: string): Promise<UserRow | null> {
    return this.database.prepare('SELECT * FROM users WHERE lower(current_email) = lower(?) LIMIT 1').bind(email).first<UserRow>();
  }

  /**
   * Stable account key lookup -- the direction every id-keyed check uses.
   */
  public async getById(id: string): Promise<UserRow | null> {
    return this.database.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').bind(id).first<UserRow>();
  }

  /**
   * Move an account's sign-in address.
   *
   * Deliberately never touches `users.email`: that is the frozen anchor the
   * legacy foreign keys and the Vectorize namespace depend on, and rewriting it
   * would cascade the account's rows out of the database.
   */
  public async setCurrentEmail(id: string, email: string, now: number): Promise<void> {
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database.prepare('UPDATE users SET current_email = ?, updated_at = ? WHERE id = ?').bind(email.toLowerCase(), now, id).run(),
      'set current user email',
    );
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

export { loginEmailOf, newAnchor, newId, UserDAO };
export type { UserRow };
