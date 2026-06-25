import type { ProviderId, ProviderSubscriptionStatus } from '../constants';

interface ProviderSubscription {
  subscriptionId: string;
  applicationId: string;
  providerId: ProviderId;
  externalSubscriptionId?: string | null;
  webhookSecretHash?: string | null;
  clientStateHash?: string | null;
  gmailHistoryId?: string | null;
  imapCursor?: string | null;
  resource?: string | null;
  status: ProviderSubscriptionStatus;
  expiresAt?: number | null;
  lastNotificationAt?: number | null;
  lastRenewedAt?: number | null;
  lastError?: string | null;
  renewalRetryCount: number;
  renewalNextRetryAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

interface ProviderSubscriptionInternal {
  subscription_id: string;
  application_id: string;
  provider_id: ProviderId;
  external_subscription_id: string | null;
  webhook_secret_hash: string | null;
  client_state_hash: string | null;
  gmail_history_id: string | null;
  imap_cursor: string | null;
  resource: string | null;
  status: ProviderSubscriptionStatus;
  expires_at: number | null;
  last_notification_at: number | null;
  last_renewed_at: number | null;
  last_error: string | null;
  renewal_retry_count: number;
  renewal_next_retry_at: number | null;
  created_at: number;
  updated_at: number;
}

export type { ProviderSubscription, ProviderSubscriptionInternal };
