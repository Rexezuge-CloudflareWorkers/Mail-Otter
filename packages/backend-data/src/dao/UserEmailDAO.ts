import { BaseDAO } from './BaseDAO';
import type { D1Queryable } from '../utils';

/**
 * One known address for an account.
 *
 * `is_verified` gates login: `1` means the address may authenticate the
 * account, `0` means it was changed away from and is retained only so rows
 * written before the change still resolve to this account. The revoked row is
 * re-pointed (not deleted) when a later account legitimately claims the
 * address, so an address is never permanently reserved.
 */
interface UserEmailRow {
  email: string;
  user_id: string;
  is_verified: number;
  created_at: number;
}

/**
 * The address registry introduced by migration 0028.
 *
 * This is the only mapping that survives an address change: `users.email` is a
 * frozen anchor and `users.current_email` is mutable, so an address → account
 * lookup has to go through here.
 */
class UserEmailDAO extends BaseDAO {
  constructor(database: D1Queryable) {
    super(database);
  }

  /**
   * Claim an address for an account.
   *
   * An existing verified row is left alone: the address already belongs to
   * someone, and silently re-pointing it would hand one account's identity to
   * another. Callers check `resolveVerified` first and reject on a hit.
   * An unverified (revoked) row is re-pointed, which releases the address.
   */
  public async register(input: {
    email: string;
    userId: string;
    isVerified: boolean;
    now: number;
  }): Promise<'claimed' | 'already-claimed'> {
    const email: string = input.email.toLowerCase();
    const existing: UserEmailRow | null = await this.get(email);
    if (existing && existing.is_verified === 1) return 'already-claimed';
    await this.withRetry(
      () =>
        this.database
          .prepare(
            `INSERT INTO user_emails (email, user_id, is_verified, created_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id, is_verified = excluded.is_verified`,
          )
          .bind(email, input.userId, input.isVerified ? 1 : 0, input.now)
          .run(),
      'register user email',
    );
    return 'claimed';
  }

  public async get(email: string): Promise<UserEmailRow | null> {
    return this.database.prepare('SELECT * FROM user_emails WHERE email = ? LIMIT 1').bind(email.toLowerCase()).first<UserEmailRow>();
  }

  /**
   * Login resolution: only a verified address identifies an account.
   */
  public async resolveVerified(email: string): Promise<UserEmailRow | null> {
    return this.database
      .prepare('SELECT * FROM user_emails WHERE email = ? AND is_verified = 1 LIMIT 1')
      .bind(email.toLowerCase())
      .first<UserEmailRow>();
  }

  public async listByUserId(userId: string): Promise<UserEmailRow[]> {
    const result: D1Result<UserEmailRow> = await this.database
      .prepare('SELECT * FROM user_emails WHERE user_id = ? ORDER BY is_verified DESC, created_at ASC')
      .bind(userId)
      .all<UserEmailRow>();
    return result.results ?? [];
  }

  /**
   * Revoke an address for login while keeping it resolvable for attribution.
   */
  public async revoke(email: string): Promise<void> {
    await this.withRetry(
      () => this.database.prepare('UPDATE user_emails SET is_verified = 0 WHERE email = ?').bind(email.toLowerCase()).run(),
      'revoke user email',
    );
  }

  /**
   * Revoke every verified address for an account. Used when an account's login
   * address changes, so only the new address can authenticate it.
   */
  public async revokeAllVerified(userId: string, exceptEmail: string): Promise<void> {
    await this.withRetry(
      () =>
        this.database
          .prepare('UPDATE user_emails SET is_verified = 0 WHERE user_id = ? AND email != ?')
          .bind(userId, exceptEmail.toLowerCase())
          .run(),
      'revoke verified user emails',
    );
  }
}

export { UserEmailDAO };
export type { UserEmailRow };
