import { CONNECTED_APPLICATION_STATUS_CONNECTED, CONNECTION_METHOD_OAUTH2 } from '@mail-otter/shared/constants';
import { executeD1WithRetry } from '../utils';
import type { D1Queryable } from '../utils';
import { TimestampUtil } from '@mail-otter/shared/utils';

interface OAuth2AccessTokenRefreshStatus {
  applicationId: string;
  accessTokenExpiresAt?: number | null | undefined;
  lastRefreshStartedAt?: number | null | undefined;
  lastRefreshSucceededAt?: number | null | undefined;
  lastRefreshFailedAt?: number | null | undefined;
  lastError?: string | null | undefined;
  createdAt: number;
  updatedAt: number;
}

interface OAuth2AccessTokenRefreshStatusInternal {
  application_id: string;
  access_token_expires_at: number | null;
  last_refresh_started_at: number | null;
  last_refresh_succeeded_at: number | null;
  last_refresh_failed_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

class OAuth2AccessTokenRefreshStatusDAO {
  protected readonly database: D1Queryable;

  constructor(database: D1Queryable) {
    this.database = database;
  }

  public async getByApplication(applicationId: string): Promise<OAuth2AccessTokenRefreshStatus | undefined> {
    const row: OAuth2AccessTokenRefreshStatusInternal | null = await this.database
      .prepare(
        `
          SELECT application_id, access_token_expires_at, last_refresh_started_at, last_refresh_succeeded_at,
                 last_refresh_failed_at, last_error, created_at, updated_at
          FROM oauth2_access_token_refresh_status
          WHERE application_id = ?
          LIMIT 1
        `,
      )
      .bind(applicationId)
      .first<OAuth2AccessTokenRefreshStatusInternal>();
    return row ? this.toStatus(row) : undefined;
  }

  public async recordRefreshStarted(applicationId: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO oauth2_access_token_refresh_status
                (application_id, access_token_expires_at, last_refresh_started_at, last_refresh_succeeded_at,
                 last_refresh_failed_at, last_error, created_at, updated_at)
              VALUES (?, NULL, ?, NULL, NULL, NULL, ?, ?)
              ON CONFLICT(application_id) DO UPDATE SET
                last_refresh_started_at = excluded.last_refresh_started_at,
                updated_at = excluded.updated_at
            `,
          )
          .bind(applicationId, now, now, now)
          .run(),
      'record OAuth2 token refresh start',
    );
  }

  public async recordRefreshSuccess(applicationId: string, accessTokenExpiresAt: number): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO oauth2_access_token_refresh_status
                (application_id, access_token_expires_at, last_refresh_started_at, last_refresh_succeeded_at,
                 last_refresh_failed_at, last_error, created_at, updated_at)
              VALUES (?, ?, NULL, ?, NULL, NULL, ?, ?)
              ON CONFLICT(application_id) DO UPDATE SET
                access_token_expires_at = excluded.access_token_expires_at,
                last_refresh_succeeded_at = excluded.last_refresh_succeeded_at,
                last_error = NULL,
                updated_at = excluded.updated_at
            `,
          )
          .bind(applicationId, accessTokenExpiresAt, now, now, now)
          .run(),
      'record OAuth2 token refresh success',
    );
  }

  public async recordRefreshFailure(applicationId: string, errorMessage: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO oauth2_access_token_refresh_status
                (application_id, access_token_expires_at, last_refresh_started_at, last_refresh_succeeded_at,
                 last_refresh_failed_at, last_error, created_at, updated_at)
              VALUES (?, NULL, NULL, NULL, ?, ?, ?, ?)
              ON CONFLICT(application_id) DO UPDATE SET
                last_refresh_failed_at = excluded.last_refresh_failed_at,
                last_error = excluded.last_error,
                updated_at = excluded.updated_at
            `,
          )
          .bind(applicationId, now, errorMessage.slice(0, 1024), now, now)
          .run(),
      'record OAuth2 token refresh failure',
    );
  }

  public async listDueApplicationIds(refreshBefore: number, limit: number): Promise<string[]> {
    const rows: Array<{ application_id: string }> = await this.database
      .prepare(
        `
          SELECT ca.application_id
          FROM connected_applications ca
          LEFT JOIN oauth2_access_token_refresh_status status ON status.application_id = ca.application_id
          WHERE ca.connection_method = ?
            AND ca.status = ?
            AND (status.access_token_expires_at IS NULL OR status.access_token_expires_at <= ?)
          ORDER BY COALESCE(status.access_token_expires_at, 0) ASC, ca.updated_at ASC
          LIMIT ?
        `,
      )
      .bind(CONNECTION_METHOD_OAUTH2, CONNECTED_APPLICATION_STATUS_CONNECTED, refreshBefore, limit)
      .all<{ application_id: string }>()
      .then((result: D1Result<{ application_id: string }>): Array<{ application_id: string }> => result.results || []);
    return rows.map((row: { application_id: string }): string => row.application_id);
  }

  private toStatus(row: OAuth2AccessTokenRefreshStatusInternal): OAuth2AccessTokenRefreshStatus {
    return {
      applicationId: row.application_id,
      accessTokenExpiresAt: row.access_token_expires_at,
      lastRefreshStartedAt: row.last_refresh_started_at,
      lastRefreshSucceededAt: row.last_refresh_succeeded_at,
      lastRefreshFailedAt: row.last_refresh_failed_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export { OAuth2AccessTokenRefreshStatusDAO };
export type { OAuth2AccessTokenRefreshStatus };
