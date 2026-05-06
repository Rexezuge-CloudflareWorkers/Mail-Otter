import type { ProviderId, ProviderSubscriptionStatus } from '../constants';

interface ProviderSubscription {
  subscriptionId: string;
  applicationId: string;
  providerId: ProviderId;
  externalSubscriptionId?: string | null | undefined;
  webhookSecretHash?: string | null | undefined;
  clientStateHash?: string | null | undefined;
  gmailHistoryId?: string | null | undefined;
  resource?: string | null | undefined;
  status: ProviderSubscriptionStatus;
  expiresAt?: number | null | undefined;
  lastNotificationAt?: number | null | undefined;
  lastRenewedAt?: number | null | undefined;
  lastError?: string | null | undefined;
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
  resource: string | null;
  status: ProviderSubscriptionStatus;
  expires_at: number | null;
  last_notification_at: number | null;
  last_renewed_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export type { ProviderSubscription, ProviderSubscriptionInternal };
