import {
  DEFAULT_ACTION_CALLBACK_BASE_URL,
  DEFAULT_ACTION_DEFAULT_EXPIRY_HOURS,
  DEFAULT_ACTION_RETENTION_DAYS,
  DEFAULT_AI_DAILY_NEURON_FALLBACK_THRESHOLD,
  DEFAULT_AI_DAILY_USAGE_RETENTION_DAYS,
  DEFAULT_AI_EMBEDDING_MODEL,
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

class ConfigurationManager {
  public static getMaxApplicationsPerUser(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'MAX_APPLICATIONS_PER_USER', DEFAULT_MAX_APPLICATIONS_PER_USER);
  }

  public static getDebugMode(env: unknown): boolean {
    return ConfigurationManager.getBoolean(env, 'DEBUG_MODE', DEFAULT_DEBUG_MODE);
  }

  public static getOauth2StateExpiryMinutes(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'OAUTH2_STATE_EXPIRY_MINUTES', DEFAULT_OAUTH2_STATE_EXPIRY_MINUTES);
  }

  public static getGmailWatchRenewalWindowHours(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'GMAIL_WATCH_RENEWAL_WINDOW_HOURS', DEFAULT_GMAIL_WATCH_RENEWAL_WINDOW_HOURS);
  }

  public static getOutlookSubscriptionRenewalWindowHours(env: unknown): number {
    return ConfigurationManager.getPositiveInt(
      env,
      'OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS',
      DEFAULT_OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS,
    );
  }

  public static getOutlookSubscriptionTtlDays(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'OUTLOOK_SUBSCRIPTION_TTL_DAYS', DEFAULT_OUTLOOK_SUBSCRIPTION_TTL_DAYS);
  }

  public static getEmailSummaryModel(env: unknown): string {
    return ConfigurationManager.getString(env, 'AI_SUMMARY_MODEL', DEFAULT_EMAIL_SUMMARY_MODEL);
  }

  public static getEmailSummaryFallbackModel(env: unknown): string {
    return ConfigurationManager.getString(env, 'AI_SUMMARY_FALLBACK_MODEL', DEFAULT_EMAIL_SUMMARY_FALLBACK_MODEL);
  }

  public static getAiDailyNeuronFallbackThreshold(env: unknown): number {
    return ConfigurationManager.getNonNegativeInt(
      env,
      'AI_DAILY_NEURON_FALLBACK_THRESHOLD',
      DEFAULT_AI_DAILY_NEURON_FALLBACK_THRESHOLD,
    );
  }

  public static getMaxEmailBodyChars(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'MAX_EMAIL_BODY_CHARS', DEFAULT_MAX_EMAIL_BODY_CHARS);
  }

  public static getAiEmbeddingModel(env: unknown): string {
    return ConfigurationManager.getString(env, 'AI_EMBEDDING_MODEL', DEFAULT_AI_EMBEDDING_MODEL);
  }

  public static getRagTopK(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'RAG_TOP_K', DEFAULT_RAG_TOP_K);
  }

  public static getRagVectorQueryTopK(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'RAG_VECTOR_QUERY_TOP_K', DEFAULT_RAG_VECTOR_QUERY_TOP_K);
  }

  public static getMaxContextMemoryChars(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'MAX_CONTEXT_MEMORY_CHARS', DEFAULT_MAX_CONTEXT_MEMORY_CHARS);
  }

  public static getMaxRagContextChars(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'MAX_RAG_CONTEXT_CHARS', DEFAULT_MAX_RAG_CONTEXT_CHARS);
  }

  public static getServeSpaFromWorker(env: unknown): boolean {
    return ConfigurationManager.getBoolean(env, 'SERVE_SPA_FROM_WORKER', DEFAULT_SERVE_SPA_FROM_WORKER);
  }

  public static getOAuth2AccessTokenRefreshWindowSeconds(env: unknown): number {
    return ConfigurationManager.getPositiveInt(
      env,
      'OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS',
      DEFAULT_OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS,
    );
  }

  public static getOAuth2AccessTokenMinValidSeconds(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS', DEFAULT_OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS);
  }

  public static getOAuth2AccessTokenFallbackTtlSeconds(env: unknown): number {
    return ConfigurationManager.getPositiveInt(
      env,
      'OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS',
      DEFAULT_OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS,
    );
  }

  public static getOAuth2TokenRefreshBatchSize(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'OAUTH2_TOKEN_REFRESH_BATCH_SIZE', DEFAULT_OAUTH2_TOKEN_REFRESH_BATCH_SIZE);
  }

  public static getRenewalRetryBaseDelaySeconds(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'RENEWAL_RETRY_BASE_DELAY_SECONDS', DEFAULT_RENEWAL_RETRY_BASE_DELAY_SECONDS);
  }

  public static getRenewalRetryMaxDelaySeconds(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'RENEWAL_RETRY_MAX_DELAY_SECONDS', DEFAULT_RENEWAL_RETRY_MAX_DELAY_SECONDS);
  }

  public static getMaxContextDocumentsPerApplication(env: unknown): number {
    return ConfigurationManager.getPositiveInt(
      env,
      'MAX_CONTEXT_DOCUMENTS_PER_APPLICATION',
      DEFAULT_MAX_CONTEXT_DOCUMENTS_PER_APPLICATION,
    );
  }

  public static getProcessedMessageRetentionDays(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'PROCESSED_MESSAGE_RETENTION_DAYS', DEFAULT_PROCESSED_MESSAGE_RETENTION_DAYS);
  }

  public static getStaleContextDocumentDeletedGraceDays(env: unknown): number {
    return ConfigurationManager.getPositiveInt(
      env,
      'STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS',
      DEFAULT_STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS,
    );
  }

  public static getStaleContextDocumentErrorGraceDays(env: unknown): number {
    return ConfigurationManager.getPositiveInt(
      env,
      'STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS',
      DEFAULT_STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS,
    );
  }

  public static getContextDeletionRunRetentionDays(env: unknown): number {
    return ConfigurationManager.getPositiveInt(
      env,
      'CONTEXT_DELETION_RUN_RETENTION_DAYS',
      DEFAULT_CONTEXT_DELETION_RUN_RETENTION_DAYS,
    );
  }

  public static getAiDailyUsageRetentionDays(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'AI_DAILY_USAGE_RETENTION_DAYS', DEFAULT_AI_DAILY_USAGE_RETENTION_DAYS);
  }

  public static getActionCallbackBaseUrl(env: unknown): string {
    return ConfigurationManager.getString(env, 'ACTION_CALLBACK_BASE_URL', DEFAULT_ACTION_CALLBACK_BASE_URL).replace(/\/+$/, '');
  }

  public static getActionDefaultExpiryHours(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'ACTION_DEFAULT_EXPIRY_HOURS', DEFAULT_ACTION_DEFAULT_EXPIRY_HOURS);
  }

  public static getActionRetentionDays(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'ACTION_RETENTION_DAYS', DEFAULT_ACTION_RETENTION_DAYS);
  }

  private static getPositiveInt(env: unknown, key: string, defaultValue: string): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (env as any)[key] as string | undefined;
    const parsed = Number(value ?? defaultValue);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : Number(defaultValue);
  }

  private static getNonNegativeInt(env: unknown, key: string, defaultValue: string): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (env as any)[key] as string | undefined;
    const parsed = Number(value ?? defaultValue);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number(defaultValue);
  }

  private static getString(env: unknown, key: string, defaultValue: string): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (env as any)[key] as string | undefined;
    return value ?? defaultValue;
  }

  private static getBoolean(env: unknown, key: string, defaultValue: string): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (env as any)[key] as string | undefined;
    return (value ?? defaultValue) === 'true';
  }
}

export { ConfigurationManager };
