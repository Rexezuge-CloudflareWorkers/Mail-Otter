import { DatabaseError } from '@mail-otter/backend-errors';
import { executeD1WithRetry } from '../utils';
import type { User, UserInternal } from '@mail-otter/shared/model';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';

class UserDAO extends BaseDAO {

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

  private toUser(row: UserInternal): User {
    return {
      email: row.email,
      preferredLanguage: row.preferred_language ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export { UserDAO };
