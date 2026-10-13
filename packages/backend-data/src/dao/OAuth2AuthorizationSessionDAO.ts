import type { OAuth2AuthorizationSession, OAuth2AuthorizationSessionInternal } from '@mail-otter/shared/model';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';
import type { D1Result } from '@rexezuge/d1';

class OAuth2AuthorizationSessionDAO extends BaseDAO {
  public async create(
    applicationId: string,
    stateHash: string,
    codeVerifier: string,
    redirectUri: string,
    expiresAt: number,
  ): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const sessionId: string = UUIDUtil.getRandomUUID();
    await this.run(
      ` INSERT INTO oauth2_authorization_sessions (session_id, application_id, state_hash, code_verifier, redirect_uri, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?) `,
      [sessionId, applicationId, stateHash, codeVerifier, redirectUri, now, expiresAt],
    );
  }

  public async getActive(applicationId: string, stateHash: string): Promise<OAuth2AuthorizationSession | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const row: OAuth2AuthorizationSessionInternal | null = await this.first<OAuth2AuthorizationSessionInternal>(
      ` SELECT session_id, application_id, state_hash, code_verifier, redirect_uri, created_at, expires_at, consumed_at FROM oauth2_authorization_sessions WHERE application_id = ? AND state_hash = ? AND expires_at > ? AND consumed_at IS NULL LIMIT 1 `,
      [applicationId, stateHash, now],
    );
    return row ? this.toSession(row) : undefined;
  }

  public async deleteExpiredSessions(limit: number): Promise<number> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await this.run(
      ` DELETE FROM oauth2_authorization_sessions WHERE session_id IN ( SELECT session_id FROM oauth2_authorization_sessions WHERE expires_at < ? OR consumed_at IS NOT NULL LIMIT ? ) `,
      [now, limit],
    );
    return (result.meta as { changes?: number })?.changes ?? 0;
  }

  public async consume(sessionId: string): Promise<void> {
    const consumedAt: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run('UPDATE oauth2_authorization_sessions SET consumed_at = ? WHERE session_id = ? AND consumed_at IS NULL', [
      consumedAt,
      sessionId,
    ]);
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
