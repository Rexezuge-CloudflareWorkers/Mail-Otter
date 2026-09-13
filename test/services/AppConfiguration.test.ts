import { describe, expect, it } from 'vitest';
import { AppConfiguration } from '@mail-otter/backend-runtime/config';

describe('AppConfiguration full surface', () => {
  it('reads every group from env with trimming and defaults', () => {
    const config = AppConfiguration.fromEnv({
      AI_SUMMARY_MODEL: 'm1',
      AI_SUMMARY_FALLBACK_MODEL: 'm2',
      AI_EMBEDDING_MODEL: 'm3',
      AI_DAILY_NEURON_FALLBACK_THRESHOLD: '11',
      AI_DAILY_NEURON_FREE_TIER_LIMIT: '12',
      AI_DAILY_USAGE_RETENTION_DAYS: '13',
      ATTACHMENT_VISION_ENABLED: 'true',
      ATTACHMENT_VISION_MODEL: 'vm',
      MAX_ATTACHMENT_SIZE_BYTES: '14',
      MAX_ATTACHMENTS_PER_EMAIL: '15',
      OAUTH2_STATE_EXPIRY_MINUTES: '16',
      OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS: '17',
      OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS: '18',
      OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS: '19',
      OAUTH2_TOKEN_REFRESH_BATCH_SIZE: '20',
      MAX_EMAIL_BODY_CHARS: '21',
      MAX_CONTEXT_MEMORY_CHARS: '22',
      MAX_RAG_CONTEXT_CHARS: '23',
      RAG_TOP_K: '24',
      RAG_VECTOR_QUERY_TOP_K: '25',
      MAX_CONTEXT_DOCUMENTS_PER_APPLICATION: '26',
      MAX_APPLICATIONS_PER_USER: '27',
      DEBUG_MODE: 'true',
      MAX_DRIVE_FILES_PER_SYNC: '28',
      PUBLIC_BASE_URL: 'https://example.com///',
      PACKAGE_TRACKING_API_KEY: 'pkg',
      FLIGHT_TRACKING_API_KEY: 'flt',
      PROCESSED_MESSAGE_RETENTION_DAYS: '29',
      BACKGROUND_TASK_RUN_RETENTION_DAYS: '30',
      CONTEXT_AUDIT_LOG_RETENTION_DAYS: '31',
      INTEGRATION_DELIVERY_LOG_RETENTION_DAYS: '32',
      CONTEXT_DELETION_RUN_RETENTION_DAYS: '33',
      STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS: '34',
      STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS: '35',
      ACTION_CALLBACK_BASE_URL: 'https://cb///',
      ACTION_DEFAULT_EXPIRY_HOURS: '36',
      ACTION_RETENTION_DAYS: '37',
      GMAIL_WATCH_RENEWAL_WINDOW_HOURS: '38',
      OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS: '39',
      OUTLOOK_SUBSCRIPTION_TTL_DAYS: '40',
      RENEWAL_RETRY_BASE_DELAY_SECONDS: '41',
      RENEWAL_RETRY_MAX_DELAY_SECONDS: '42',
      CHAT_MAX_RESPONSE_TOKENS: '43',
      CHAT_VECTOR_QUERY_TOP_K: '44',
      CHAT_CONTEXT_TOP_K: '45',
      CHAT_MAX_HISTORY_MESSAGES: '46',
    });
    expect(config.getSummaryModel()).toBe('m1');
    expect(config.getSummaryFallbackModel()).toBe('m2');
    expect(config.getEmbeddingModel()).toBe('m3');
    expect(config.getAiDailyNeuronFallbackThreshold()).toBe(11);
    expect(config.getAiDailyNeuronFreeTierLimit()).toBe(12);
    expect(config.getAiDailyUsageRetentionDays()).toBe(13);
    expect(config.isAttachmentVisionEnabled()).toBe(true);
    expect(config.getAttachmentVisionModel()).toBe('vm');
    expect(config.getMaxAttachmentSizeBytes()).toBe(14);
    expect(config.getMaxAttachmentsPerEmail()).toBe(15);
    expect(config.getOauth2StateExpiryMinutes()).toBe(16);
    expect(config.getAccessTokenRefreshWindowSeconds()).toBe(17);
    expect(config.getAccessTokenMinValidSeconds()).toBe(18);
    expect(config.getAccessTokenFallbackTtlSeconds()).toBe(19);
    expect(config.getTokenRefreshBatchSize()).toBe(20);
    expect(config.getMaxEmailBodyChars()).toBe(21);
    expect(config.getMaxContextMemoryChars()).toBe(22);
    expect(config.getMaxRagContextChars()).toBe(23);
    expect(config.getRagTopK()).toBe(24);
    expect(config.getRagVectorQueryTopK()).toBe(25);
    expect(config.getMaxDocumentsPerApplication()).toBe(26);
    expect(config.getMaxApplicationsPerUser()).toBe(27);
    expect(config.getDebugMode()).toBe(true);
    expect(config.getMaxDriveFilesPerSync()).toBe(28);
    expect(config.getPublicBaseUrl()).toBe('https://example.com');
    expect(config.getPackageTrackingApiKey()).toBe('pkg');
    expect(config.getFlightTrackingApiKey()).toBe('flt');
    expect(config.getProcessedMessageRetentionDays()).toBe(29);
    expect(config.getTaskRunRetentionDays()).toBe(30);
    expect(config.getContextAuditLogRetentionDays()).toBe(31);
    expect(config.getIntegrationDeliveryLogRetentionDays()).toBe(32);
    expect(config.getContextDeletionRunRetentionDays()).toBe(33);
    expect(config.getStaleDocumentDeletedGraceDays()).toBe(34);
    expect(config.getStaleDocumentErrorGraceDays()).toBe(35);
    expect(config.getActionCallbackBaseUrl()).toBe('https://cb');
    expect(config.getActionDefaultExpiryHours()).toBe(36);
    expect(config.getActionRetentionDays()).toBe(37);
    expect(config.getGmailWatchRenewalWindowHours()).toBe(38);
    expect(config.getOutlookRenewalWindowHours()).toBe(39);
    expect(config.getOutlookTtlDays()).toBe(40);
    expect(config.getRenewalRetryBaseDelaySeconds()).toBe(41);
    expect(config.getRenewalRetryMaxDelaySeconds()).toBe(42);
    expect(config.getChatMaxResponseTokens()).toBe(43);
    expect(config.getChatVectorQueryTopK()).toBe(44);
    expect(config.getChatContextTopK()).toBe(45);
    expect(config.getChatMaxHistoryMessages()).toBe(46);
  });
});
