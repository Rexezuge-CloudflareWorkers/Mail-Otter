export type ProviderId = 'google-gmail' | 'microsoft-outlook' | 'fastmail-jmap' | 'yahoo-mail' | 'custom-imap' | 'apple-icloud';

export type EmailRuleConditionMatcherField = 'from' | 'subject' | 'body';
export type EmailRuleConditionMatcherOp = 'contains' | 'not_contains' | 'matches_sender';

export interface EmailRuleConditionMatcher {
  field: EmailRuleConditionMatcherField;
  op: EmailRuleConditionMatcherOp;
  value: string;
}

export interface EmailRuleCondition {
  operator: 'all' | 'any';
  matchers: EmailRuleConditionMatcher[];
}

export interface EmailRuleAction {
  type: 'skip' | 'skip_actions' | 'prepend_instruction';
  instruction?: string;
}

export interface EmailProcessingRule {
  ruleId: string;
  name: string;
  enabled: boolean;
  conditions: EmailRuleCondition;
  action: EmailRuleAction;
}

export type OutboundIntegrationType = 'slack' | 'discord' | 'webhook';

export type IntegrationDeliveryStatus = 'success' | 'failure';

export interface OutboundIntegration {
  integrationId: string;
  applicationId: string;
  integrationType: OutboundIntegrationType;
  name: string;
  maskedWebhookUrl: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastDeliveryAt: number | null;
  lastDeliveryStatus: IntegrationDeliveryStatus | null;
  consecutiveFailures: number;
}

export interface IntegrationDeliveryLog {
  logId: string;
  integrationId: string;
  applicationId: string;
  status: IntegrationDeliveryStatus;
  httpStatus: number | null;
  errorMessage: string | null;
  emailSubject: string | null;
  createdAt: number;
}

export interface SenderDomainFilters {
  includeRules: string[];
}

export interface CurrentUser {
  email: string;
  limits: {
    maxApplicationsPerUser: number;
    maxContextDocumentsPerApplication: number;
  };
  aiUsage: {
    estimatedNeurons: number;
    dailyNeuronLimit: number;
    fallbackThreshold: number;
  };
}

export interface ConnectedApplication {
  applicationId: string;
  userEmail: string;
  providerEmail?: string | null;
  displayName: string;
  providerId: ProviderId;
  connectionMethod: 'oauth2' | 'imap-password';
  status: 'draft' | 'connected' | 'error';
  enabledFeatures?: string[] | null;
  timeZone?: string | null;
  senderDomainFilters?: SenderDomainFilters | null;
  emailProcessingRules?: EmailProcessingRule[] | null;
  autoExecuteActionTypes?: string[] | null;
  digestConfig?: DigestConfig | null;
  gmailPubsubTopicName?: string | null;
  imapHost?: string | null;
  imapPort?: number | null;
  imapUsername?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  watchedFolders?: Array<{ id: string; name: string }> | null;
  oauth2RedirectUri?: string;
  webhookUrl?: string;
  watchStatus?: 'active' | 'stopped' | 'error';
  watchExpiresAt?: number | null;
  lastSummaryAt?: number | null;
  lastError?: string | null;
  lastErrorAt?: number | null;
  contextIndexingEnabled: boolean;
  ragRetrievalEnabled: boolean;
  maxContextDocuments?: number | null;
  contextDocumentCount?: number;
  contextLastIndexedAt?: number | null;
  contextLastDeleteAcceptedAt?: number | null;
  contextLastError?: string | null;
  contextLastErrorAt?: number | null;
  integrations?: OutboundIntegration[];
  updatedAt: number;
}

export interface DigestConfig {
  enabled: boolean;
  sendTime: string;
  sections: string[];
  lastSentAt: string | null;
}

export type ApplicationContextDocumentStatus = 'active' | 'deleted' | 'error';
export type ApplicationContextDeletionStatus = 'accepted' | 'error';
export type EmailActionStatus = 'pending' | 'executing' | 'succeeded' | 'failed' | 'expired' | 'cancelled';
export type EmailActionType =
  | 'calendar.add_event'
  | 'email.draft_reply'
  | 'external.open_link'
  | 'manual.todo'
  | 'delivery.track_package'
  | 'travel.track_flight'
  | 'finance.pay_bill'
  | 'appointment.confirm';
export type EmailActionExecutionTrigger = 'email_callback' | 'web_ui' | 'system_expiry' | 'auto_execute';

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
  | 'summary_sent'
  | 'action_created'
  | 'action_executed'
  | 'document_deleted'
  | 'error';

export interface ContextAuditLogList {
  logs: ContextAuditLog[];
  nextCursor?: string | null;
}
