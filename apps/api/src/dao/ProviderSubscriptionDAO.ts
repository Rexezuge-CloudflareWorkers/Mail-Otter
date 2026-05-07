import {
  PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
  PROVIDER_SUBSCRIPTION_STATUS_ERROR,
  PROVIDER_SUBSCRIPTION_STATUS_STOPPED,
} from '@mail-otter/shared/constants';
import { DatabaseError } from '@/error';
import type { ProviderId } from '@mail-otter/shared/constants';
import type { ProviderSubscription, ProviderSubscriptionInternal } from '@mail-otter/shared/model';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';

interface UpsertProviderSubscriptionInput {
  applicationId: string;
  providerId: ProviderId;
  externalSubscriptionId?: string | null | undefined;
  webhookSecretHash?: string | null | undefined;
  clientStateHash?: string | null | undefined;
  gmailHistoryId?: string | null | undefined;
  resource?: string | null | undefined;
  expiresAt?: number | null | undefined;
}

class ProviderSubscriptionDAO {
  protected readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  public async upsertActive(input: UpsertProviderSubscriptionInput): Promise<ProviderSubscription> {
    const existing: ProviderSubscription | undefined = await this.getByApplication(input.applicationId);
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    if (existing) {
      const result: D1Result = await this.database
        .prepare(
          `
            UPDATE provider_subscriptions
            SET external_subscription_id = ?, webhook_secret_hash = ?, client_state_hash = ?, gmail_history_id = ?,
                resource = ?, status = ?, expires_at = ?, last_error = NULL, last_renewed_at = ?, updated_at = ?
            WHERE subscription_id = ?
          `,
        )
        .bind(
          input.externalSubscriptionId || null,
          input.webhookSecretHash || existing.webhookSecretHash || null,
          input.clientStateHash || null,
          input.gmailHistoryId || existing.gmailHistoryId || null,
          input.resource || null,
          PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
          input.expiresAt ?? null,
          now,
          now,
          existing.subscriptionId,
        )
        .run();
      if (!result.success) {
        throw new DatabaseError(`Failed to update provider subscription: ${result.error}`);
      }
      const updated: ProviderSubscription | undefined = await this.getById(existing.subscriptionId);
      if (!updated) throw new DatabaseError('Failed to load provider subscription after update.');
      return updated;
    }

    const subscriptionId: string = UUIDUtil.getRandomUUID();
    const result: D1Result = await this.database
      .prepare(
        `
          INSERT INTO provider_subscriptions
            (subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, client_state_hash, gmail_history_id, resource, status, expires_at, last_notification_at, last_renewed_at, last_error, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)
        `,
      )
      .bind(
        subscriptionId,
        input.applicationId,
        input.providerId,
        input.externalSubscriptionId || null,
        input.webhookSecretHash || null,
        input.clientStateHash || null,
        input.gmailHistoryId || null,
        input.resource || null,
        PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
        input.expiresAt ?? null,
        now,
        now,
        now,
      )
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to create provider subscription: ${result.error}`);
    }
    const created: ProviderSubscription | undefined = await this.getById(subscriptionId);
    if (!created) throw new DatabaseError('Failed to load provider subscription after create.');
    return created;
  }

  public async getByApplication(applicationId: string): Promise<ProviderSubscription | undefined> {
    const row: ProviderSubscriptionInternal | null = await this.database
      .prepare(
        `
          SELECT subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, client_state_hash, gmail_history_id, resource, status, expires_at, last_notification_at, last_renewed_at, last_error, created_at, updated_at
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
          SELECT subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, client_state_hash, gmail_history_id, resource, status, expires_at, last_notification_at, last_renewed_at, last_error, created_at, updated_at
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
          SELECT subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, client_state_hash, gmail_history_id, resource, status, expires_at, last_notification_at, last_renewed_at, last_error, created_at, updated_at
          FROM provider_subscriptions
          WHERE status = ? AND expires_at IS NOT NULL AND expires_at <= ?
          ORDER BY expires_at ASC
        `,
      )
      .bind(PROVIDER_SUBSCRIPTION_STATUS_ACTIVE, maxExpiresAt || now)
      .all<ProviderSubscriptionInternal>()
      .then((result: D1Result<ProviderSubscriptionInternal>): ProviderSubscriptionInternal[] => result.results || []);
    return rows.map((row: ProviderSubscriptionInternal): ProviderSubscription => this.toSubscription(row));
  }

  public async updateGmailHistory(subscriptionId: string, gmailHistoryId: string, lastNotificationAt?: number): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await this.database
      .prepare(
        'UPDATE provider_subscriptions SET gmail_history_id = ?, last_notification_at = COALESCE(?, last_notification_at), updated_at = ? WHERE subscription_id = ?',
      )
      .bind(gmailHistoryId, lastNotificationAt ?? null, now, subscriptionId)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to update Gmail history cursor: ${result.error}`);
    }
  }

  public async touchNotification(subscriptionId: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await this.database
      .prepare('UPDATE provider_subscriptions SET last_notification_at = ?, updated_at = ? WHERE subscription_id = ?')
      .bind(now, now, subscriptionId)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to update provider subscription notification timestamp: ${result.error}`);
    }
  }

  public async markStopped(applicationId: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await this.database
      .prepare('UPDATE provider_subscriptions SET status = ?, updated_at = ? WHERE application_id = ?')
      .bind(PROVIDER_SUBSCRIPTION_STATUS_STOPPED, now, applicationId)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to stop provider subscription: ${result.error}`);
    }
  }

  public async markError(subscriptionId: string, errorMessage: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await this.database
      .prepare('UPDATE provider_subscriptions SET status = ?, last_error = ?, updated_at = ? WHERE subscription_id = ?')
      .bind(PROVIDER_SUBSCRIPTION_STATUS_ERROR, errorMessage.slice(0, 1024), now, subscriptionId)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to mark provider subscription error: ${result.error}`);
    }
  }

  private async getById(subscriptionId: string): Promise<ProviderSubscription | undefined> {
    const row: ProviderSubscriptionInternal | null = await this.database
      .prepare(
        `
          SELECT subscription_id, application_id, provider_id, external_subscription_id, webhook_secret_hash, client_state_hash, gmail_history_id, resource, status, expires_at, last_notification_at, last_renewed_at, last_error, created_at, updated_at
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
      resource: row.resource,
      status: row.status,
      expiresAt: row.expires_at,
      lastNotificationAt: row.last_notification_at,
      lastRenewedAt: row.last_renewed_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export { ProviderSubscriptionDAO };
export type { UpsertProviderSubscriptionInput };
