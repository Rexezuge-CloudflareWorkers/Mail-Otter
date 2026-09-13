import type { GmailMessage } from '@mail-otter/provider-clients/gmail';
import type { OutlookMessage } from '@mail-otter/provider-clients/outlook';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import type { CreatedEmailAction } from '../../action';

interface EmailProcessingEnv {
  DB: import('@mail-otter/backend-data/utils').D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_SIGNING_SECRET: SecretsStoreSecret;
  AI: Ai;
  EMAIL_CONTEXT_INDEX?: Vectorize;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  AI_SUMMARY_MODEL?: string;
  AI_SUMMARY_FALLBACK_MODEL?: string;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
  AI_EMBEDDING_MODEL?: string;
  MAX_EMAIL_BODY_CHARS?: string;
  DEBUG_MODE?: string;
  MAX_CONTEXT_MEMORY_CHARS?: string;
  MAX_RAG_CONTEXT_CHARS?: string;
  RAG_TOP_K?: string;
  RAG_VECTOR_QUERY_TOP_K?: string;
  ACTION_CALLBACK_BASE_URL?: string;
  ACTION_DEFAULT_EXPIRY_HOURS?: string;
  ATTACHMENT_VISION_ENABLED?: string;
  ATTACHMENT_VISION_MODEL?: string;
  MAX_ATTACHMENT_SIZE_BYTES?: string;
  MAX_ATTACHMENTS_PER_EMAIL?: string;
}

interface EmailProcessingOptions {
  retryAttempt?: number;
  callbackBaseUrl?: string;
}

interface ResolvedApplication {
  application: ConnectedApplication;
  accessToken: string;
  enabledApplicationIds: string[];
}

interface GmailMessageList {
  messageIds: string[];
  historyId: string;
  subscriptionId: string;
}

interface GmailSummaryData {
  message: GmailMessage;
  summaryHtml: string;
  summaryModel: string;
  rawSummary: { gist: string; keyDetails: string[] };
  emailSubject: string;
  emailFrom: string;
  actions: CreatedEmailAction[];
  application: ConnectedApplication;
  accessToken: string;
  messageId: string;
  options: EmailProcessingOptions;
}

interface OutlookSummaryData {
  message: OutlookMessage;
  summaryHtml: string;
  summaryModel: string;
  rawSummary: { gist: string; keyDetails: string[] };
  emailSubject: string;
  emailFrom: string;
  actions: CreatedEmailAction[];
  application: ConnectedApplication;
  accessToken: string;
  messageId: string;
  options: EmailProcessingOptions;
}

interface JmapSummaryData {
  email: { id: string; subject?: string | null; from?: Array<{ email: string; name?: string }> | null; threadId?: string | null };
  summaryHtml: string;
  summaryModel: string;
  rawSummary: { gist: string; keyDetails: string[] };
  emailSubject: string;
  emailFrom: string;
  actions: CreatedEmailAction[];
  application: ConnectedApplication;
  accessToken: string;
  emailId: string;
  options: EmailProcessingOptions;
}

interface ImapSummaryData {
  summaryHtml: string;
  summaryModel: string;
  rawSummary: { gist: string; keyDetails: string[] };
  emailSubject: string;
  emailFrom: string;
  actions: CreatedEmailAction[];
  application: ConnectedApplication;
  messageId: string;
  uid: number;
  options: EmailProcessingOptions;
}

export type {
  EmailProcessingEnv,
  EmailProcessingOptions,
  ResolvedApplication,
  GmailMessageList,
  GmailSummaryData,
  OutlookSummaryData,
  JmapSummaryData,
  ImapSummaryData,
};
export type { EmailQueueMessage } from '@mail-otter/shared/model';
