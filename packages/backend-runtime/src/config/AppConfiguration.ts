import { EnvParser } from './EnvParser';
import {
  DEFAULT_ACTION_CALLBACK_BASE_URL,
  DEFAULT_ACTION_DEFAULT_EXPIRY_HOURS,
  DEFAULT_ACTION_RETENTION_DAYS,
  DEFAULT_AI_DAILY_NEURON_FALLBACK_THRESHOLD,
  DEFAULT_AI_DAILY_NEURON_FREE_TIER_LIMIT,
  DEFAULT_AI_DAILY_USAGE_RETENTION_DAYS,
  DEFAULT_AI_EMBEDDING_MODEL,
  DEFAULT_ATTACHMENT_VISION_ENABLED,
  DEFAULT_ATTACHMENT_VISION_MODEL,
  DEFAULT_BACKGROUND_TASK_RUN_RETENTION_DAYS,
  DEFAULT_CHAT_CONTEXT_TOP_K,
  DEFAULT_CHAT_MAX_HISTORY_MESSAGES,
  DEFAULT_CHAT_MAX_RESPONSE_TOKENS,
  DEFAULT_CHAT_VECTOR_QUERY_TOP_K,
  DEFAULT_CONTEXT_AUDIT_LOG_RETENTION_DAYS,
  DEFAULT_CONTEXT_DELETION_RUN_RETENTION_DAYS,
  DEFAULT_DEBUG_MODE,
  DEFAULT_EMAIL_SUMMARY_FALLBACK_MODEL,
  DEFAULT_EMAIL_SUMMARY_MODEL,
  DEFAULT_FLIGHT_TRACKING_API_KEY,
  DEFAULT_GMAIL_WATCH_RENEWAL_WINDOW_HOURS,
  DEFAULT_INTEGRATION_DELIVERY_LOG_RETENTION_DAYS,
  DEFAULT_MAX_APPLICATIONS_PER_USER,
  DEFAULT_MAX_ATTACHMENTS_PER_EMAIL,
  DEFAULT_MAX_ATTACHMENT_SIZE_BYTES,
  DEFAULT_MAX_CONTEXT_DOCUMENTS_PER_APPLICATION,
  DEFAULT_MAX_CONTEXT_MEMORY_CHARS,
  DEFAULT_MAX_DRIVE_FILES_PER_SYNC,
  DEFAULT_MAX_EMAIL_BODY_CHARS,
  DEFAULT_MAX_RAG_CONTEXT_CHARS,
  DEFAULT_OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS,
  DEFAULT_OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS,
  DEFAULT_OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS,
  DEFAULT_OAUTH2_STATE_EXPIRY_MINUTES,
  DEFAULT_OAUTH2_TOKEN_REFRESH_BATCH_SIZE,
  DEFAULT_OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS,
  DEFAULT_OUTLOOK_SUBSCRIPTION_TTL_DAYS,
  DEFAULT_PACKAGE_TRACKING_API_KEY,
  DEFAULT_PROCESSED_MESSAGE_RETENTION_DAYS,
  DEFAULT_PUBLIC_BASE_URL,
  DEFAULT_RAG_TOP_K,
  DEFAULT_RAG_VECTOR_QUERY_TOP_K,
  DEFAULT_RENEWAL_RETRY_BASE_DELAY_SECONDS,
  DEFAULT_RENEWAL_RETRY_MAX_DELAY_SECONDS,
  DEFAULT_STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS,
  DEFAULT_STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS,
} from './ConfigurationDefaults';

/**
 * Injectable instance view over environment configuration.
 *
 * `ConfigurationManager` statics remain as a thin facade delegating here for
 * backward compatibility. New code should accept `AppConfiguration` (or the
 * namespaced groups) via constructor injection so env parsing is stubbable.
 *
 * Each method takes no env — the env is captured at construction time.
 */
class AppConfiguration {
  constructor(private readonly env: unknown) {}

  public static fromEnv(env: unknown): AppConfiguration {
    return new AppConfiguration(env);
  }

  // ─── AI ───
  public getSummaryModel(): string {
    return EnvParser.string(this.env, 'AI_SUMMARY_MODEL', DEFAULT_EMAIL_SUMMARY_MODEL);
  }

  public getSummaryFallbackModel(): string {
    return EnvParser.string(this.env, 'AI_SUMMARY_FALLBACK_MODEL', DEFAULT_EMAIL_SUMMARY_FALLBACK_MODEL);
  }

  public getEmbeddingModel(): string {
    return EnvParser.string(this.env, 'AI_EMBEDDING_MODEL', DEFAULT_AI_EMBEDDING_MODEL);
  }

  public getAiDailyNeuronFallbackThreshold(): number {
    return EnvParser.nonNegativeInt(this.env, 'AI_DAILY_NEURON_FALLBACK_THRESHOLD', DEFAULT_AI_DAILY_NEURON_FALLBACK_THRESHOLD);
  }

  public getAiDailyNeuronFreeTierLimit(): number {
    return EnvParser.positiveInt(this.env, 'AI_DAILY_NEURON_FREE_TIER_LIMIT', DEFAULT_AI_DAILY_NEURON_FREE_TIER_LIMIT);
  }

  public getAiDailyUsageRetentionDays(): number {
    return EnvParser.positiveInt(this.env, 'AI_DAILY_USAGE_RETENTION_DAYS', DEFAULT_AI_DAILY_USAGE_RETENTION_DAYS);
  }

  // ─── Attachments ───
  public getMaxAttachmentSizeBytes(): number {
    return EnvParser.positiveInt(this.env, 'MAX_ATTACHMENT_SIZE_BYTES', DEFAULT_MAX_ATTACHMENT_SIZE_BYTES);
  }

  public getMaxAttachmentsPerEmail(): number {
    return EnvParser.positiveInt(this.env, 'MAX_ATTACHMENTS_PER_EMAIL', DEFAULT_MAX_ATTACHMENTS_PER_EMAIL);
  }

  public isAttachmentVisionEnabled(): boolean {
    return EnvParser.boolean(this.env, 'ATTACHMENT_VISION_ENABLED', DEFAULT_ATTACHMENT_VISION_ENABLED);
  }

  public getAttachmentVisionModel(): string {
    return EnvParser.string(this.env, 'ATTACHMENT_VISION_MODEL', DEFAULT_ATTACHMENT_VISION_MODEL);
  }

  // ─── OAuth2 ───
  public getOauth2StateExpiryMinutes(): number {
    return EnvParser.positiveInt(this.env, 'OAUTH2_STATE_EXPIRY_MINUTES', DEFAULT_OAUTH2_STATE_EXPIRY_MINUTES);
  }

  public getAccessTokenRefreshWindowSeconds(): number {
    return EnvParser.positiveInt(this.env, 'OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS', DEFAULT_OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS);
  }

  public getAccessTokenMinValidSeconds(): number {
    return EnvParser.positiveInt(this.env, 'OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS', DEFAULT_OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS);
  }

  public getAccessTokenFallbackTtlSeconds(): number {
    return EnvParser.positiveInt(this.env, 'OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS', DEFAULT_OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS);
  }

  public getTokenRefreshBatchSize(): number {
    return EnvParser.positiveInt(this.env, 'OAUTH2_TOKEN_REFRESH_BATCH_SIZE', DEFAULT_OAUTH2_TOKEN_REFRESH_BATCH_SIZE);
  }

  // ─── Context / RAG ───
  public getMaxEmailBodyChars(): number {
    return EnvParser.positiveInt(this.env, 'MAX_EMAIL_BODY_CHARS', DEFAULT_MAX_EMAIL_BODY_CHARS);
  }

  public getMaxContextMemoryChars(): number {
    return EnvParser.positiveInt(this.env, 'MAX_CONTEXT_MEMORY_CHARS', DEFAULT_MAX_CONTEXT_MEMORY_CHARS);
  }

  public getMaxRagContextChars(): number {
    return EnvParser.positiveInt(this.env, 'MAX_RAG_CONTEXT_CHARS', DEFAULT_MAX_RAG_CONTEXT_CHARS);
  }

  public getRagTopK(): number {
    return EnvParser.positiveInt(this.env, 'RAG_TOP_K', DEFAULT_RAG_TOP_K);
  }

  public getRagVectorQueryTopK(): number {
    return EnvParser.positiveInt(this.env, 'RAG_VECTOR_QUERY_TOP_K', DEFAULT_RAG_VECTOR_QUERY_TOP_K);
  }

  public getMaxDocumentsPerApplication(): number {
    return EnvParser.positiveInt(this.env, 'MAX_CONTEXT_DOCUMENTS_PER_APPLICATION', DEFAULT_MAX_CONTEXT_DOCUMENTS_PER_APPLICATION);
  }

  // ─── Misc ───
  public getMaxApplicationsPerUser(): number {
    return EnvParser.positiveInt(this.env, 'MAX_APPLICATIONS_PER_USER', DEFAULT_MAX_APPLICATIONS_PER_USER);
  }

  public getDebugMode(): boolean {
    return EnvParser.boolean(this.env, 'DEBUG_MODE', DEFAULT_DEBUG_MODE);
  }

  public getMaxDriveFilesPerSync(): number {
    return EnvParser.positiveInt(this.env, 'MAX_DRIVE_FILES_PER_SYNC', DEFAULT_MAX_DRIVE_FILES_PER_SYNC);
  }

  public getPublicBaseUrl(): string {
    let url = EnvParser.string(this.env, 'PUBLIC_BASE_URL', DEFAULT_PUBLIC_BASE_URL);
    while (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }

  public getPackageTrackingApiKey(): string {
    return EnvParser.string(this.env, 'PACKAGE_TRACKING_API_KEY', DEFAULT_PACKAGE_TRACKING_API_KEY);
  }

  public getFlightTrackingApiKey(): string {
    return EnvParser.string(this.env, 'FLIGHT_TRACKING_API_KEY', DEFAULT_FLIGHT_TRACKING_API_KEY);
  }

  public getProcessedMessageRetentionDays(): number {
    return EnvParser.positiveInt(this.env, 'PROCESSED_MESSAGE_RETENTION_DAYS', DEFAULT_PROCESSED_MESSAGE_RETENTION_DAYS);
  }

  public getTaskRunRetentionDays(): number {
    return EnvParser.positiveInt(this.env, 'BACKGROUND_TASK_RUN_RETENTION_DAYS', DEFAULT_BACKGROUND_TASK_RUN_RETENTION_DAYS);
  }

  public getContextAuditLogRetentionDays(): number {
    return EnvParser.positiveInt(this.env, 'CONTEXT_AUDIT_LOG_RETENTION_DAYS', DEFAULT_CONTEXT_AUDIT_LOG_RETENTION_DAYS);
  }

  public getIntegrationDeliveryLogRetentionDays(): number {
    return EnvParser.positiveInt(this.env, 'INTEGRATION_DELIVERY_LOG_RETENTION_DAYS', DEFAULT_INTEGRATION_DELIVERY_LOG_RETENTION_DAYS);
  }

  public getContextDeletionRunRetentionDays(): number {
    return EnvParser.positiveInt(this.env, 'CONTEXT_DELETION_RUN_RETENTION_DAYS', DEFAULT_CONTEXT_DELETION_RUN_RETENTION_DAYS);
  }

  public getStaleDocumentDeletedGraceDays(): number {
    return EnvParser.positiveInt(this.env, 'STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS', DEFAULT_STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS);
  }

  public getStaleDocumentErrorGraceDays(): number {
    return EnvParser.positiveInt(this.env, 'STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS', DEFAULT_STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS);
  }

  public getActionCallbackBaseUrl(): string {
    let url = EnvParser.string(this.env, 'ACTION_CALLBACK_BASE_URL', DEFAULT_ACTION_CALLBACK_BASE_URL);
    while (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }

  public getActionDefaultExpiryHours(): number {
    return EnvParser.positiveInt(this.env, 'ACTION_DEFAULT_EXPIRY_HOURS', DEFAULT_ACTION_DEFAULT_EXPIRY_HOURS);
  }

  public getActionRetentionDays(): number {
    return EnvParser.positiveInt(this.env, 'ACTION_RETENTION_DAYS', DEFAULT_ACTION_RETENTION_DAYS);
  }

  public getGmailWatchRenewalWindowHours(): number {
    return EnvParser.positiveInt(this.env, 'GMAIL_WATCH_RENEWAL_WINDOW_HOURS', DEFAULT_GMAIL_WATCH_RENEWAL_WINDOW_HOURS);
  }

  public getOutlookRenewalWindowHours(): number {
    return EnvParser.positiveInt(this.env, 'OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS', DEFAULT_OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS);
  }

  public getOutlookTtlDays(): number {
    return EnvParser.positiveInt(this.env, 'OUTLOOK_SUBSCRIPTION_TTL_DAYS', DEFAULT_OUTLOOK_SUBSCRIPTION_TTL_DAYS);
  }

  public getRenewalRetryBaseDelaySeconds(): number {
    return EnvParser.positiveInt(this.env, 'RENEWAL_RETRY_BASE_DELAY_SECONDS', DEFAULT_RENEWAL_RETRY_BASE_DELAY_SECONDS);
  }

  public getRenewalRetryMaxDelaySeconds(): number {
    return EnvParser.positiveInt(this.env, 'RENEWAL_RETRY_MAX_DELAY_SECONDS', DEFAULT_RENEWAL_RETRY_MAX_DELAY_SECONDS);
  }

  public getChatMaxResponseTokens(): number {
    return EnvParser.positiveInt(this.env, 'CHAT_MAX_RESPONSE_TOKENS', DEFAULT_CHAT_MAX_RESPONSE_TOKENS);
  }

  public getChatVectorQueryTopK(): number {
    return EnvParser.positiveInt(this.env, 'CHAT_VECTOR_QUERY_TOP_K', DEFAULT_CHAT_VECTOR_QUERY_TOP_K);
  }

  public getChatContextTopK(): number {
    return EnvParser.positiveInt(this.env, 'CHAT_CONTEXT_TOP_K', DEFAULT_CHAT_CONTEXT_TOP_K);
  }

  public getChatMaxHistoryMessages(): number {
    return EnvParser.positiveInt(this.env, 'CHAT_MAX_HISTORY_MESSAGES', DEFAULT_CHAT_MAX_HISTORY_MESSAGES);
  }
}

export { AppConfiguration };
