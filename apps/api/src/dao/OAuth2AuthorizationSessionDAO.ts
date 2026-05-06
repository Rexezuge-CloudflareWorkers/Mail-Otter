import { DatabaseError } from '@/error';
import type { OAuth2AuthorizationSession, OAuth2AuthorizationSessionInternal } from '@mail-otter/shared/model';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';

class OAuth2AuthorizationSessionDAO {
  protected readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  public async create(
    applicationId: string,
    stateHash: string,
    codeVerifier: string,
    redirectUri: string,
    expiresAt: number,
  ): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const sessionId: string = UUIDUtil.getRandomUUID();
    const result: D1Result = await this.database
      .prepare(
        `
          INSERT INTO oauth2_authorization_sessions
            (session_id, application_id, state_hash, code_verifier, redirect_uri, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(sessionId, applicationId, stateHash, codeVerifier, redirectUri, now, expiresAt)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to create OAuth2 authorization session: ${result.error}`);
    }
  }

  public async getActive(applicationId: string, stateHash: string): Promise<OAuth2AuthorizationSession | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const row: OAuth2AuthorizationSessionInternal | null = await this.database
      .prepare(
        `
          SELECT session_id, application_id, state_hash, code_verifier, redirect_uri, created_at, expires_at, consumed_at
          FROM oauth2_authorization_sessions
          WHERE application_id = ? AND state_hash = ? AND expires_at > ? AND consumed_at IS NULL
          LIMIT 1
        `,
      )
      .bind(applicationId, stateHash, now)
      .first<OAuth2AuthorizationSessionInternal>();
    return row ? this.toSession(row) : undefined;
  }

  public async consume(sessionId: string): Promise<void> {
    const consumedAt: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await this.database
      .prepare('UPDATE oauth2_authorization_sessions SET consumed_at = ? WHERE session_id = ? AND consumed_at IS NULL')
      .bind(consumedAt, sessionId)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to consume OAuth2 authorization session: ${result.error}`);
    }
  }

  private toSession(row: OAuth2AuthorizationSessionInternal): OAuth2AuthorizationSession {
    return {
      sessionId: row.session_id,
      applicationId: row.application_id,
      stateHash: row.state_hash,
      codeVerifier: row.code_verifier,
      redirectUri: row.redirect_uri,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    };
  }
}

export { OAuth2AuthorizationSessionDAO };
