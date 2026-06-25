import type { EmailQueueMessage } from '@mail-otter/shared/model';

declare global {
  interface Env {
    DB: D1Database;
    AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
    ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
    ACTION_SIGNING_SECRET: SecretsStoreSecret;
    AI: Ai;
    OAUTH2_TOKEN_CACHE: KVNamespace;
    CRON_TASKS: DurableObjectNamespace;
    OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
    EMAIL_EVENTS_QUEUE: Queue<EmailQueueMessage>;
    EMAIL_PROCESSING_WORKFLOW: Workflow<EmailQueueMessage>;
    EMAIL_CONTEXT_INDEX: Vectorize;
    DEBUG_MODE?: string;
    SERVE_SPA_FROM_WORKER?: string;
    DEV_AUTH_EMAIL?: string;
    MAX_APPLICATIONS_PER_USER?: string;
    OAUTH2_STATE_EXPIRY_MINUTES?: string;
    AI_SUMMARY_MODEL?: string;
    AI_SUMMARY_FALLBACK_MODEL?: string;
    AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
    AI_EMBEDDING_MODEL?: string;
    MAX_EMAIL_BODY_CHARS?: string;
    MAX_CONTEXT_MEMORY_CHARS?: string;
    MAX_RAG_CONTEXT_CHARS?: string;
    RAG_TOP_K?: string;
    RAG_VECTOR_QUERY_TOP_K?: string;
    GMAIL_WATCH_RENEWAL_WINDOW_HOURS?: string;
    OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS?: string;
    OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string;
    OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS?: string;
    OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
    OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS?: string;
    OAUTH2_TOKEN_REFRESH_BATCH_SIZE?: string;
    MAX_CONTEXT_DOCUMENTS_PER_APPLICATION?: string;
    ACTION_CALLBACK_BASE_URL?: string;
    ACTION_DEFAULT_EXPIRY_HOURS?: string;
    ACTION_RETENTION_DAYS?: string;
    PACKAGE_TRACKING_API_KEY?: string;
    FLIGHT_TRACKING_API_KEY?: string;
    ATTACHMENT_VISION_ENABLED?: string;
    ATTACHMENT_VISION_MODEL?: string;
    MAX_ATTACHMENT_SIZE_BYTES?: string;
    MAX_ATTACHMENTS_PER_EMAIL?: string;
  }
}

export {};
