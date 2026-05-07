import type { EmailQueueMessage } from '@mail-otter/shared/model';

declare global {
  interface Env {
    DB: D1Database;
    AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
    AI: Ai;
    EMAIL_EVENTS_QUEUE: Queue<EmailQueueMessage>;
    EMAIL_PROCESSING_WORKFLOW: Workflow<EmailQueueMessage>;
    EMAIL_CONTEXT_INDEX: Vectorize;
    SERVE_SPA_FROM_WORKER?: string | undefined;
    DEV_AUTH_EMAIL?: string | undefined;
    MAX_APPLICATIONS_PER_USER?: string | undefined;
    OAUTH2_STATE_EXPIRY_MINUTES?: string | undefined;
    AI_SUMMARY_MODEL?: string | undefined;
    AI_EMBEDDING_MODEL?: string | undefined;
    MAX_EMAIL_BODY_CHARS?: string | undefined;
    MAX_CONTEXT_MEMORY_CHARS?: string | undefined;
    MAX_RAG_CONTEXT_CHARS?: string | undefined;
    RAG_TOP_K?: string | undefined;
    RAG_VECTOR_QUERY_TOP_K?: string | undefined;
    GMAIL_WATCH_RENEWAL_WINDOW_HOURS?: string | undefined;
    OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS?: string | undefined;
    OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string | undefined;
  }
}

export {};
