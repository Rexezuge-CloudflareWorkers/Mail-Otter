export type ProviderId = 'google-gmail' | 'microsoft-outlook';

export interface CurrentUser {
  email: string;
  limits: {
    maxApplicationsPerUser: number;
    maxContextDocumentsPerApplication: number;
  };
}

export interface ConnectedApplication {
  applicationId: string;
  userEmail: string;
  providerEmail?: string | null;
  displayName: string;
  providerId: ProviderId;
  connectionMethod: 'oauth2';
  status: 'draft' | 'connected' | 'error';
  gmailPubsubTopicName?: string | null;
  watchedFolders?: Array<{ id: string; name: string }> | null;
  oauth2RedirectUri?: string;
  webhookUrl?: string;
  watchStatus?: 'active' | 'stopped' | 'error';
  watchExpiresAt?: number | null;
  lastSummaryAt?: number | null;
  lastError?: string | null;
  lastErrorAt?: number | null;
  contextIndexingEnabled: boolean;
  maxContextDocuments?: number | null;
  contextDocumentCount?: number;
  contextLastIndexedAt?: number | null;
  contextLastDeleteAcceptedAt?: number | null;
  contextLastError?: string | null;
  contextLastErrorAt?: number | null;
  updatedAt: number;
}

export type ApplicationContextDocumentStatus = 'active' | 'deleted' | 'error';
export type ApplicationContextDeletionStatus = 'accepted' | 'error';
export type EmailActionStatus = 'pending' | 'executing' | 'succeeded' | 'failed' | 'expired' | 'cancelled';
export type EmailActionType = 'calendar.add_event' | 'email.draft_reply' | 'external.open_link' | 'manual.todo';
export type EmailActionExecutionTrigger = 'email_callback' | 'web_ui' | 'system_expiry';

export interface ApplicationContextDocument {
  contextDocumentId: string;
  applicationId: string;
  userEmail: string;
  sourceType: string;
  sourceProviderId: ProviderId;
  vectorNamespace: string;
  vectorId: string;
  sourceDocumentFingerprint?: string | null;
  sourceThreadFingerprint?: string | null;
  titleFingerprint?: string | null;
  senderFingerprint?: string | null;
  contentFingerprint?: string | null;
  indexedTextChars: number;
  status: ApplicationContextDocumentStatus;
  indexedAt?: number | null;
  deletedAt?: number | null;
  lastError?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ApplicationContextDeletionRun {
  deletionRunId: string;
  applicationId: string;
  userEmail: string;
  vectorNamespace: string;
  requestedVectorCount: number;
  deletedVectorCount: number;
  mutationIds: string[];
  status: ApplicationContextDeletionStatus;
  errorMessage?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface EmailAction {
  actionId: string;
  processedMessageId: string;
  applicationId: string;
  userEmail: string;
  providerId: ProviderId;
  providerMessageId: string;
  providerThreadId?: string | null;
  actionType: EmailActionType;
  status: EmailActionStatus;
  riskLevel: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  payload: Record<string, unknown> & { type: EmailActionType };
  result?: {
    summary: string;
    providerOperationId?: string;
    providerUrl?: string;
    externalUrl?: string;
  } | null;
  errorMessage?: string | null;
  expiresAt: number;
  executedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface EmailActionExecution {
  executionId: string;
  actionId: string;
  attempt: number;
  triggeredBy: EmailActionExecutionTrigger;
  status: EmailActionStatus;
  providerOperationId?: string | null;
  requestUserAgentHash?: string | null;
  errorMessage?: string | null;
  createdAt: number;
  completedAt?: number | null;
}

export interface ContextAuditLog {
  id: string;
  contextDocumentId: string;
  applicationId: string;
  userEmail: string;
  sourceDocumentId?: string | null;
  eventType: ContextAuditEventType;
  eventLabel?: string | null;
  eventData?: unknown | null;
  severity: 'info' | 'warning' | 'error';
  createdAt: number;
}

export type ContextAuditEventType =
  | 'email_received'
  | 'processing_started'
  | 'context_indexed'
  | 'context_skipped'
  | 'embedding_generated'
  | 'rag_queried'
  | 'summary_generated'
  | 'action_created'
  | 'action_executed'
  | 'document_deleted'
  | 'error';

export interface ContextAuditLogList {
  logs: ContextAuditLog[];
  nextCursor?: string | null;
}
