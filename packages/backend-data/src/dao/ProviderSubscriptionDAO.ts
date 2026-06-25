import {
  PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
  PROVIDER_SUBSCRIPTION_STATUS_ERROR,
  PROVIDER_SUBSCRIPTION_STATUS_STOPPED,
} from '@mail-otter/shared/constants';
import { DatabaseError } from '@mail-otter/backend-errors';
import { executeD1WithRetry } from '../utils';
import type { ProviderId } from '@mail-otter/shared/constants';
import type { ProviderSubscription, ProviderSubscriptionInternal } from '@mail-otter/shared/model';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';

interface UpsertProviderSubscriptionInput {
  applicationId: string;
  providerId?: ProviderId;
  externalSubscriptionId?: string | null;
  webhookSecretHash?: string | null;
  clientStateHash?: string | null;
  gmailHistoryId?: string | null;
  imapCursor?: string | null;
  resource?: string | null;
  expiresAt?: number | null;
}

class ProviderSubscriptionDAO extends BaseDAO {

  public async upsertActive(input: UpsertProviderSubscriptionInput): Promise<ProviderSubscription> {
    const existing: ProviderSubscription | undefined = await this.getByApplication(input.applicationId);
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    if (existing) {
      await executeD1WithRetry(
        (): Promise<D1Result> =>
          this.database
            .prepare(
              `
                UPDATE provider_subscriptions
                SET external_subscription_id = ?, webhook_secret_hash = ?, client_state_hash = ?, gmail_history_id = ?,
                    imap_cursor = ?, resource = ?, status = ?, expires_at = ?, last_error = NULL, last_renewed_at = ?,
                    renewal_retry_count = 0, renewal_next_retry_at = NULL, updated_at = ?
                WHERE subscription_id = ?
              `,
            )
            .bind(
              input.externalSubscriptionId || null,
              input.webhookSecretHash || existing.webhookSecretHash || null,
              input.clientStateHash || null,
              input.gmailHistoryId || existing.gmailHistoryId || null,
              input.imapCursor || existing.imapCursor || null,
              input.resource || null,
              PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
              input.expiresAt ?? null,
              now,
              now,
              existing.subscriptionId,
            )
            .run(),
        'update provider subscription',
      );
      const updated: ProviderSubscription | undefined = await this.getById(existing.subscriptionId);
      if (!updated) throw new DatabaseError('Failed to load provider subscription after update.');
      return updated;
    }

    const subscriptionId: string = UUIDUtil.getRandomUUID();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO provider_subscriptions
                (subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, client_state_hash, gmail_history_id, imap_cursor, resource, status, expires_at, last_notification_at, last_renewed_at, last_error, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)
            `,
          )
          .bind(
            subscriptionId,
            input.applicationId,
            input.providerId ?? null,
            input.externalSubscriptionId || null,
            input.webhookSecretHash || null,
            input.clientStateHash || null,
            input.gmailHistoryId || null,
            input.imapCursor || null,
            input.resource || null,
            PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
            input.expiresAt ?? null,
            now,
            now,
            now,
          )
          .run(),
      'create provider subscription',
    );
    const created: ProviderSubscription | undefined = await this.getById(subscriptionId);
    if (!created) throw new DatabaseError('Failed to load provider subscription after create.');
    return created;
  }

  public async getByApplication(applicationId: string): Promise<ProviderSubscription | undefined> {
    const row: ProviderSubscriptionInternal | null = await this.database
      .prepare(
        `
          SELECT subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, client_state_hash, gmail_history_id, imap_cursor, resource, status, expires_at, last_notification_at, last_renewed_at, last_error, renewal_retry_count, renewal_next_retry_at, created_at, updated_at
          FROM provider_subscriptions
          WHERE application_id = ?
          LIMIT 1
        `,
      )
      .bind(applicationId)
      .first<ProviderSubscriptionInternal>();
    return row ? this.toSubscription(row) : undefined;
  }

  public async getByExternalSubscriptionId(externalSubscriptionId: string): Promise<ProviderSubscription | undefined> {
    const row: ProviderSubscriptionInternal | null = await this.database
      .prepare(
        `
          SELECT subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, client_state_hash, gmail_history_id, imap_cursor, resource, status, expires_at, last_notification_at, last_renewed_at, last_error, renewal_retry_count, renewal_next_retry_at, created_at, updated_at
          FROM provider_subscriptions
          WHERE external_subscription_id = ?
          LIMIT 1
        `,
      )
      .bind(externalSubscriptionId)
      .first<ProviderSubscriptionInternal>();
    return row ? this.toSubscription(row) : undefined;
  }

  public async listActiveRenewalCandidates(now: number, maxExpiresAt: number): Promise<ProviderSubscription[]> {
    const rows: ProviderSubscriptionInternal[] = await this.database
      .prepare(
        `
          SELECT subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, client_state_hash, gmail_history_id, imap_cursor, resource, status, expires_at, last_notification_at, last_renewed_at, last_error, renewal_retry_count, renewal_next_retry_at, created_at, updated_at
          FROM provider_subscriptions
          WHERE status IN (?, ?) AND expires_at IS NOT NULL AND expires_at <= ?
            AND (renewal_next_retry_at IS NULL OR renewal_next_retry_at <= ?)
          ORDER BY expires_at ASC
        `,
      )
      .bind(PROVIDER_SUBSCRIPTION_STATUS_ACTIVE, PROVIDER_SUBSCRIPTION_STATUS_ERROR, maxExpiresAt || now, now)
      .all<ProviderSubscriptionInternal>()
      .then((result: D1Result<ProviderSubscriptionInternal>): ProviderSubscriptionInternal[] => result.results || []);
    return rows.map((row: ProviderSubscriptionInternal): ProviderSubscription => this.toSubscription(row));
  }

  public async updateGmailHistory(subscriptionId: string, gmailHistoryId: string, lastNotificationAt?: number): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            'UPDATE provider_subscriptions SET gmail_history_id = ?, last_notification_at = COALESCE(?, last_notification_at), updated_at = ? WHERE subscription_id = ?',
          )
          .bind(gmailHistoryId, lastNotificationAt ?? null, now, subscriptionId)
          .run(),
      'update Gmail history cursor',
    );
  }

  public async updateImapCursor(subscriptionId: string, imapCursor: string, lastNotificationAt?: number): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            'UPDATE provider_subscriptions SET imap_cursor = ?, last_notification_at = COALESCE(?, last_notification_at), updated_at = ? WHERE subscription_id = ?',
          )
          .bind(imapCursor, lastNotificationAt ?? null, now, subscriptionId)
          .run(),
      'update IMAP cursor',
    );
  }

  public async listActiveImapSubscriptions(): Promise<ProviderSubscription[]> {
    const rows: ProviderSubscriptionInternal[] = await this.database
      .prepare(
        `
          SELECT subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, client_state_hash, gmail_history_id, imap_cursor, resource, status, expires_at, last_notification_at, last_renewed_at, last_error, renewal_retry_count, renewal_next_retry_at, created_at, updated_at
          FROM provider_subscriptions
          WHERE status = ? AND imap_cursor IS NOT NULL
          ORDER BY last_notification_at ASC NULLS FIRST
        `,
      )
      .bind(PROVIDER_SUBSCRIPTION_STATUS_ACTIVE)
      .all<ProviderSubscriptionInternal>()
      .then((result: D1Result<ProviderSubscriptionInternal>): ProviderSubscriptionInternal[] => result.results || []);
    return rows.map((row: ProviderSubscriptionInternal): ProviderSubscription => this.toSubscription(row));
  }

  public async touchNotification(subscriptionId: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('UPDATE provider_subscriptions SET last_notification_at = ?, updated_at = ? WHERE subscription_id = ?')
          .bind(now, now, subscriptionId)
          .run(),
      'update provider subscription notification timestamp',
    );
  }

  public async markStopped(applicationId: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('UPDATE provider_subscriptions SET status = ?, updated_at = ? WHERE application_id = ?')
          .bind(PROVIDER_SUBSCRIPTION_STATUS_STOPPED, now, applicationId)
          .run(),
      'stop provider subscription',
    );
  }

  public async markError(subscriptionId: string, errorMessage: string, nextRetryAt?: number): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            'UPDATE provider_subscriptions SET status = ?, last_error = ?, renewal_retry_count = renewal_retry_count + 1, renewal_next_retry_at = ?, updated_at = ? WHERE subscription_id = ?',
          )
          .bind(PROVIDER_SUBSCRIPTION_STATUS_ERROR, errorMessage.slice(0, 1024), nextRetryAt ?? null, now, subscriptionId)
          .run(),
      'mark provider subscription error',
    );
  }

  public async recordTransientError(subscriptionId: string, errorMessage: string, nextRetryAt: number): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            'UPDATE provider_subscriptions SET last_error = ?, renewal_retry_count = renewal_retry_count + 1, renewal_next_retry_at = ?, updated_at = ? WHERE subscription_id = ?',
          )
          .bind(errorMessage.slice(0, 1024), nextRetryAt, now, subscriptionId)
          .run(),
      'record transient error on provider subscription',
    );
  }

  private async getById(subscriptionId: string): Promise<ProviderSubscription | undefined> {
    const row: ProviderSubscriptionInternal | null = await this.database
      .prepare(
        `
          SELECT subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, client_state_hash, gmail_history_id, imap_cursor, resource, status, expires_at, last_notification_at, last_renewed_at, last_error, renewal_retry_count, renewal_next_retry_at, created_at, updated_at
          FROM provider_subscriptions
          WHERE subscription_id = ?
          LIMIT 1
        `,
      )
      .bind(subscriptionId)
      .first<ProviderSubscriptionInternal>();
    return row ? this.toSubscription(row) : undefined;
  }

  private toSubscription(row: ProviderSubscriptionInternal): ProviderSubscription {
    return {
      subscriptionId: row.subscription_id,
      applicationId: row.application_id,
      providerId: row.provider_id,
      externalSubscriptionId: row.external_subscription_id,
      webhookSecretHash: row.webhook_secret_hash,
      clientStateHash: row.client_state_hash,
      gmailHistoryId: row.gmail_history_id,
      imapCursor: row.imap_cursor,
      resource: row.resource,
      status: row.status,
      expiresAt: row.expires_at,
      lastNotificationAt: row.last_notification_at,
      lastRenewedAt: row.last_renewed_at,
      lastError: row.last_error,
      renewalRetryCount: row.renewal_retry_count,
      renewalNextRetryAt: row.renewal_next_retry_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export { ProviderSubscriptionDAO };
export type { UpsertProviderSubscriptionInput };
