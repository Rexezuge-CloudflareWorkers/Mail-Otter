import {
  DEFAULT_ACTION_CALLBACK_BASE_URL,
  DEFAULT_ACTION_DEFAULT_EXPIRY_HOURS,
  DEFAULT_ACTION_RETENTION_DAYS,
  DEFAULT_AI_DAILY_NEURON_FALLBACK_THRESHOLD,
  DEFAULT_AI_DAILY_NEURON_FREE_TIER_LIMIT,
  DEFAULT_AI_DAILY_USAGE_RETENTION_DAYS,
  DEFAULT_AI_EMBEDDING_MODEL,
  DEFAULT_CONTEXT_AUDIT_LOG_RETENTION_DAYS,
  DEFAULT_INTEGRATION_DELIVERY_LOG_RETENTION_DAYS,
  DEFAULT_PACKAGE_TRACKING_API_KEY,
  DEFAULT_FLIGHT_TRACKING_API_KEY,
  DEFAULT_BACKGROUND_TASK_RUN_RETENTION_DAYS,
  DEFAULT_CONTEXT_DELETION_RUN_RETENTION_DAYS,
  DEFAULT_DEBUG_MODE,
  DEFAULT_EMAIL_SUMMARY_FALLBACK_MODEL,
  DEFAULT_EMAIL_SUMMARY_MODEL,
  DEFAULT_GMAIL_WATCH_RENEWAL_WINDOW_HOURS,
  DEFAULT_MAX_APPLICATIONS_PER_USER,
  DEFAULT_MAX_CONTEXT_DOCUMENTS_PER_APPLICATION,
  DEFAULT_MAX_CONTEXT_MEMORY_CHARS,
  DEFAULT_MAX_EMAIL_BODY_CHARS,
  DEFAULT_MAX_RAG_CONTEXT_CHARS,
  DEFAULT_OAUTH2_STATE_EXPIRY_MINUTES,
  DEFAULT_OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS,
  DEFAULT_OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS,
  DEFAULT_OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS,
  DEFAULT_OAUTH2_TOKEN_REFRESH_BATCH_SIZE,
  DEFAULT_OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS,
  DEFAULT_OUTLOOK_SUBSCRIPTION_TTL_DAYS,
  DEFAULT_PROCESSED_MESSAGE_RETENTION_DAYS,
  DEFAULT_RAG_TOP_K,
  DEFAULT_RAG_VECTOR_QUERY_TOP_K,
  DEFAULT_RENEWAL_RETRY_BASE_DELAY_SECONDS,
  DEFAULT_RENEWAL_RETRY_MAX_DELAY_SECONDS,
  DEFAULT_SERVE_SPA_FROM_WORKER,
  DEFAULT_STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS,
  DEFAULT_STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS,
} from './ConfigurationDefaults';
import { EnvParser } from './EnvParser';

class ConfigurationManager {
  // ─── Namespace groups ────────────────────────────────────────────────────────

  public static readonly ai = {
    getSummaryModel: (env: unknown): string => EnvParser.string(env, 'AI_SUMMARY_MODEL', DEFAULT_EMAIL_SUMMARY_MODEL),
    getSummaryFallbackModel: (env: unknown): string => EnvParser.string(env, 'AI_SUMMARY_FALLBACK_MODEL', DEFAULT_EMAIL_SUMMARY_FALLBACK_MODEL),
    getEmbeddingModel: (env: unknown): string => EnvParser.string(env, 'AI_EMBEDDING_MODEL', DEFAULT_AI_EMBEDDING_MODEL),
    getDailyNeuronFallbackThreshold: (env: unknown): number => EnvParser.nonNegativeInt(env, 'AI_DAILY_NEURON_FALLBACK_THRESHOLD', DEFAULT_AI_DAILY_NEURON_FALLBACK_THRESHOLD),
    getDailyNeuronFreeTierLimit: (env: unknown): number => EnvParser.positiveInt(env, 'AI_DAILY_NEURON_FREE_TIER_LIMIT', DEFAULT_AI_DAILY_NEURON_FREE_TIER_LIMIT),
    getDailyUsageRetentionDays: (env: unknown): number => EnvParser.positiveInt(env, 'AI_DAILY_USAGE_RETENTION_DAYS', DEFAULT_AI_DAILY_USAGE_RETENTION_DAYS),
  };

  public static readonly oauth2 = {
    getStateExpiryMinutes: (env: unknown): number => EnvParser.positiveInt(env, 'OAUTH2_STATE_EXPIRY_MINUTES', DEFAULT_OAUTH2_STATE_EXPIRY_MINUTES),
    getAccessTokenRefreshWindowSeconds: (env: unknown): number => EnvParser.positiveInt(env, 'OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS', DEFAULT_OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS),
    getAccessTokenMinValidSeconds: (env: unknown): number => EnvParser.positiveInt(env, 'OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS', DEFAULT_OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS),
    getAccessTokenFallbackTtlSeconds: (env: unknown): number => EnvParser.positiveInt(env, 'OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS', DEFAULT_OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS),
    getTokenRefreshBatchSize: (env: unknown): number => EnvParser.positiveInt(env, 'OAUTH2_TOKEN_REFRESH_BATCH_SIZE', DEFAULT_OAUTH2_TOKEN_REFRESH_BATCH_SIZE),
  };

  public static readonly context = {
    getMaxEmailBodyChars: (env: unknown): number => EnvParser.positiveInt(env, 'MAX_EMAIL_BODY_CHARS', DEFAULT_MAX_EMAIL_BODY_CHARS),
    getMaxContextMemoryChars: (env: unknown): number => EnvParser.positiveInt(env, 'MAX_CONTEXT_MEMORY_CHARS', DEFAULT_MAX_CONTEXT_MEMORY_CHARS),
    getMaxRagContextChars: (env: unknown): number => EnvParser.positiveInt(env, 'MAX_RAG_CONTEXT_CHARS', DEFAULT_MAX_RAG_CONTEXT_CHARS),
    getRagTopK: (env: unknown): number => EnvParser.positiveInt(env, 'RAG_TOP_K', DEFAULT_RAG_TOP_K),
    getRagVectorQueryTopK: (env: unknown): number => EnvParser.positiveInt(env, 'RAG_VECTOR_QUERY_TOP_K', DEFAULT_RAG_VECTOR_QUERY_TOP_K),
    getMaxDocumentsPerApplication: (env: unknown): number => EnvParser.positiveInt(env, 'MAX_CONTEXT_DOCUMENTS_PER_APPLICATION', DEFAULT_MAX_CONTEXT_DOCUMENTS_PER_APPLICATION),
    getDeletionRunRetentionDays: (env: unknown): number => EnvParser.positiveInt(env, 'CONTEXT_DELETION_RUN_RETENTION_DAYS', DEFAULT_CONTEXT_DELETION_RUN_RETENTION_DAYS),
    getAuditLogRetentionDays: (env: unknown): number => EnvParser.positiveInt(env, 'CONTEXT_AUDIT_LOG_RETENTION_DAYS', DEFAULT_CONTEXT_AUDIT_LOG_RETENTION_DAYS),
    getStaleDocumentDeletedGraceDays: (env: unknown): number => EnvParser.positiveInt(env, 'STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS', DEFAULT_STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS),
    getStaleDocumentErrorGraceDays: (env: unknown): number => EnvParser.positiveInt(env, 'STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS', DEFAULT_STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS),
  };

  public static readonly subscription = {
    getGmailRenewalWindowHours: (env: unknown): number => EnvParser.positiveInt(env, 'GMAIL_WATCH_RENEWAL_WINDOW_HOURS', DEFAULT_GMAIL_WATCH_RENEWAL_WINDOW_HOURS),
    getOutlookRenewalWindowHours: (env: unknown): number => EnvParser.positiveInt(env, 'OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS', DEFAULT_OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS),
    getOutlookTtlDays: (env: unknown): number => EnvParser.positiveInt(env, 'OUTLOOK_SUBSCRIPTION_TTL_DAYS', DEFAULT_OUTLOOK_SUBSCRIPTION_TTL_DAYS),
    getRenewalRetryBaseDelaySeconds: (env: unknown): number => EnvParser.positiveInt(env, 'RENEWAL_RETRY_BASE_DELAY_SECONDS', DEFAULT_RENEWAL_RETRY_BASE_DELAY_SECONDS),
    getRenewalRetryMaxDelaySeconds: (env: unknown): number => EnvParser.positiveInt(env, 'RENEWAL_RETRY_MAX_DELAY_SECONDS', DEFAULT_RENEWAL_RETRY_MAX_DELAY_SECONDS),
  };

  public static readonly action = {
    getCallbackBaseUrl: (env: unknown): string => {
      let url = EnvParser.string(env, 'ACTION_CALLBACK_BASE_URL', DEFAULT_ACTION_CALLBACK_BASE_URL);
      while (url.endsWith('/')) url = url.slice(0, -1);
      return url;
    },
    getDefaultExpiryHours: (env: unknown): number => EnvParser.positiveInt(env, 'ACTION_DEFAULT_EXPIRY_HOURS', DEFAULT_ACTION_DEFAULT_EXPIRY_HOURS),
    getRetentionDays: (env: unknown): number => EnvParser.positiveInt(env, 'ACTION_RETENTION_DAYS', DEFAULT_ACTION_RETENTION_DAYS),
  };

  public static readonly limits = {
    getMaxApplicationsPerUser: (env: unknown): number => EnvParser.positiveInt(env, 'MAX_APPLICATIONS_PER_USER', DEFAULT_MAX_APPLICATIONS_PER_USER),
    getProcessedMessageRetentionDays: (env: unknown): number => EnvParser.positiveInt(env, 'PROCESSED_MESSAGE_RETENTION_DAYS', DEFAULT_PROCESSED_MESSAGE_RETENTION_DAYS),
  };

  public static readonly integrations = {
    getDeliveryLogRetentionDays: (env: unknown): number => EnvParser.positiveInt(env, 'INTEGRATION_DELIVERY_LOG_RETENTION_DAYS', DEFAULT_INTEGRATION_DELIVERY_LOG_RETENTION_DAYS),
  };

  public static readonly digest = {
    getPackageTrackingApiKey: (env: unknown): string => EnvParser.string(env, 'PACKAGE_TRACKING_API_KEY', DEFAULT_PACKAGE_TRACKING_API_KEY),
    getFlightTrackingApiKey: (env: unknown): string => EnvParser.string(env, 'FLIGHT_TRACKING_API_KEY', DEFAULT_FLIGHT_TRACKING_API_KEY),
  };

  public static readonly processing = {
    getTaskRunRetentionDays: (env: unknown): number => EnvParser.positiveInt(env, 'BACKGROUND_TASK_RUN_RETENTION_DAYS', DEFAULT_BACKGROUND_TASK_RUN_RETENTION_DAYS),
  };

  // ─── Flat API (backward-compatible, delegates to namespace groups) ────────────

  public static getMaxApplicationsPerUser(env: unknown): number { return this.limits.getMaxApplicationsPerUser(env); }
  public static getDebugMode(env: unknown): boolean { return EnvParser.boolean(env, 'DEBUG_MODE', DEFAULT_DEBUG_MODE); }
  public static getOauth2StateExpiryMinutes(env: unknown): number { return this.oauth2.getStateExpiryMinutes(env); }
  public static getGmailWatchRenewalWindowHours(env: unknown): number { return this.subscription.getGmailRenewalWindowHours(env); }
  public static getOutlookSubscriptionRenewalWindowHours(env: unknown): number { return this.subscription.getOutlookRenewalWindowHours(env); }
  public static getOutlookSubscriptionTtlDays(env: unknown): number { return this.subscription.getOutlookTtlDays(env); }
  public static getEmailSummaryModel(env: unknown): string { return this.ai.getSummaryModel(env); }
  public static getEmailSummaryFallbackModel(env: unknown): string { return this.ai.getSummaryFallbackModel(env); }
  public static getAiDailyNeuronFallbackThreshold(env: unknown): number { return this.ai.getDailyNeuronFallbackThreshold(env); }
  public static getAiDailyNeuronFreeTierLimit(env: unknown): number { return this.ai.getDailyNeuronFreeTierLimit(env); }
  public static getMaxEmailBodyChars(env: unknown): number { return this.context.getMaxEmailBodyChars(env); }
  public static getAiEmbeddingModel(env: unknown): string { return this.ai.getEmbeddingModel(env); }
  public static getRagTopK(env: unknown): number { return this.context.getRagTopK(env); }
  public static getRagVectorQueryTopK(env: unknown): number { return this.context.getRagVectorQueryTopK(env); }
  public static getMaxContextMemoryChars(env: unknown): number { return this.context.getMaxContextMemoryChars(env); }
  public static getMaxRagContextChars(env: unknown): number { return this.context.getMaxRagContextChars(env); }
  public static getServeSpaFromWorker(env: unknown): boolean { return EnvParser.boolean(env, 'SERVE_SPA_FROM_WORKER', DEFAULT_SERVE_SPA_FROM_WORKER); }
  public static getOAuth2AccessTokenRefreshWindowSeconds(env: unknown): number { return this.oauth2.getAccessTokenRefreshWindowSeconds(env); }
  public static getOAuth2AccessTokenMinValidSeconds(env: unknown): number { return this.oauth2.getAccessTokenMinValidSeconds(env); }
  public static getOAuth2AccessTokenFallbackTtlSeconds(env: unknown): number { return this.oauth2.getAccessTokenFallbackTtlSeconds(env); }
  public static getOAuth2TokenRefreshBatchSize(env: unknown): number { return this.oauth2.getTokenRefreshBatchSize(env); }
  public static getRenewalRetryBaseDelaySeconds(env: unknown): number { return this.subscription.getRenewalRetryBaseDelaySeconds(env); }
  public static getRenewalRetryMaxDelaySeconds(env: unknown): number { return this.subscription.getRenewalRetryMaxDelaySeconds(env); }
  public static getMaxContextDocumentsPerApplication(env: unknown): number { return this.context.getMaxDocumentsPerApplication(env); }
  public static getProcessedMessageRetentionDays(env: unknown): number { return this.limits.getProcessedMessageRetentionDays(env); }
  public static getStaleContextDocumentDeletedGraceDays(env: unknown): number { return this.context.getStaleDocumentDeletedGraceDays(env); }
  public static getStaleContextDocumentErrorGraceDays(env: unknown): number { return this.context.getStaleDocumentErrorGraceDays(env); }
  public static getContextDeletionRunRetentionDays(env: unknown): number { return this.context.getDeletionRunRetentionDays(env); }
  public static getAiDailyUsageRetentionDays(env: unknown): number { return this.ai.getDailyUsageRetentionDays(env); }
  public static getActionCallbackBaseUrl(env: unknown): string { return this.action.getCallbackBaseUrl(env); }
  public static getActionDefaultExpiryHours(env: unknown): number { return this.action.getDefaultExpiryHours(env); }
  public static getActionRetentionDays(env: unknown): number { return this.action.getRetentionDays(env); }
  public static getContextAuditLogRetentionDays(env: unknown): number { return this.context.getAuditLogRetentionDays(env); }
  public static getIntegrationDeliveryLogRetentionDays(env: unknown): number { return this.integrations.getDeliveryLogRetentionDays(env); }
}

export { ConfigurationManager };
