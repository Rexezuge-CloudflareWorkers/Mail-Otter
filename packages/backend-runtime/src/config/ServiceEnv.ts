// Shared service env (Value Object) consolidating the 5x duplicated
// DB/AI/VECTORIZE/secrets env interfaces previously spread across
// ChatEnv, DigestServiceEnv, OrchestratorEnv, EmailProcessingEnv and
// Drive ingestion envs. Extend per-domain rather than redeclaring.
// NOTE: DB is intentionally `unknown` here — backend-runtime (Layer 1)
// must not import backend-data (Layer 2). Narrow to D1Queryable at use sites.
interface ServiceEnv {
  DB: unknown;
  AI: Ai;
  EMAIL_CONTEXT_INDEX?: Vectorize | VectorizeIndex;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret | { get(): Promise<string> };
  ACTION_ENCRYPTION_KEY_SECRET?: SecretsStoreSecret | { get(): Promise<string> };
  ACTION_SIGNING_SECRET?: SecretsStoreSecret | { get(): Promise<string> };
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
  AI_EMBEDDING_MODEL?: string;
  AI_SUMMARY_MODEL?: string;
  AI_SUMMARY_FALLBACK_MODEL?: string;
  MAX_CONTEXT_MEMORY_CHARS?: string;
  MAX_ATTACHMENT_SIZE_BYTES?: string;
  MAX_DRIVE_FILES_PER_SYNC?: string;
}

export type { ServiceEnv };
