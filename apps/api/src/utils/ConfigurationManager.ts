import {
  DEFAULT_AI_EMBEDDING_MODEL,
  DEFAULT_EMAIL_SUMMARY_MODEL,
  DEFAULT_GMAIL_WATCH_RENEWAL_WINDOW_HOURS,
  DEFAULT_MAX_APPLICATIONS_PER_USER,
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
  DEFAULT_RAG_TOP_K,
  DEFAULT_RAG_VECTOR_QUERY_TOP_K,
  DEFAULT_SERVE_SPA_FROM_WORKER,
} from '@/constants';

class ConfigurationManager {
  public static getMaxApplicationsPerUser(env: unknown): number {
    return ConfigurationManager.getPositiveInt(env, 'MAX_APPLICATIONS_PER_USER', DEFAULT_MAX_APPLICATIONS_PER_USER);
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

  private static getPositiveInt(env: unknown, key: string, defaultValue: string): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (env as any)[key] as string | undefined;
    const parsed = Number(value ?? defaultValue);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : Number(defaultValue);
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
