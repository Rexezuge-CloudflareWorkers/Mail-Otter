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
    DEBUG_MODE?: string | undefined;
    SERVE_SPA_FROM_WORKER?: string | undefined;
    DEV_AUTH_EMAIL?: string | undefined;
    MAX_APPLICATIONS_PER_USER?: string | undefined;
    OAUTH2_STATE_EXPIRY_MINUTES?: string | undefined;
    AI_SUMMARY_MODEL?: string | undefined;
    AI_SUMMARY_FALLBACK_MODEL?: string | undefined;
    AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string | undefined;
    AI_EMBEDDING_MODEL?: string | undefined;
    MAX_EMAIL_BODY_CHARS?: string | undefined;
    MAX_CONTEXT_MEMORY_CHARS?: string | undefined;
    MAX_RAG_CONTEXT_CHARS?: string | undefined;
    RAG_TOP_K?: string | undefined;
    RAG_VECTOR_QUERY_TOP_K?: string | undefined;
    GMAIL_WATCH_RENEWAL_WINDOW_HOURS?: string | undefined;
    OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS?: string | undefined;
    OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string | undefined;
    OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS?: string | undefined;
    OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
    OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS?: string | undefined;
    OAUTH2_TOKEN_REFRESH_BATCH_SIZE?: string | undefined;
    MAX_CONTEXT_DOCUMENTS_PER_APPLICATION?: string | undefined;
    ACTION_CALLBACK_BASE_URL?: string | undefined;
    ACTION_DEFAULT_EXPIRY_HOURS?: string | undefined;
    ACTION_RETENTION_DAYS?: string | undefined;
  }
}

export {};
