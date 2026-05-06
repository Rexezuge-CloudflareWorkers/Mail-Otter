import { DatabaseError } from '@/error';
import type { User, UserInternal } from '@mail-otter/shared/model';
import { TimestampUtil } from '@mail-otter/shared/utils';

class UserDAO {
  protected readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  public async upsertByEmail(email: string): Promise<User> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await this.database
      .prepare(
        `
          INSERT INTO users (email, created_at, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET updated_at = excluded.updated_at
        `,
      )
      .bind(email, now, now)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to upsert user: ${result.error}`);
    }
    const user: User | undefined = await this.getByEmail(email);
    if (!user) {
      throw new DatabaseError('Failed to load user after upsert.');
    }
    return user;
  }

  public async getByEmail(email: string): Promise<User | undefined> {
    const row: UserInternal | null = await this.database
      .prepare('SELECT email, created_at, updated_at FROM users WHERE email = ? LIMIT 1')
      .bind(email)
      .first<UserInternal>();
    return row ? this.toUser(row) : undefined;
  }

  private toUser(row: UserInternal): User {
    return {
      email: row.email,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export { UserDAO };
