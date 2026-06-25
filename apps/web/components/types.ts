export type ProviderId = 'google-gmail' | 'microsoft-outlook' | 'fastmail-jmap' | 'yahoo-mail' | 'custom-imap' | 'apple-icloud';

export type EmailRuleConditionMatcherField = 'from' | 'subject' | 'body' | 'has_attachment' | 'detected_action_type';
export type EmailRuleConditionMatcherOp = 'contains' | 'not_contains' | 'matches_sender' | 'is' | 'includes' | 'not_includes';

export type EmailRuleConditionMatcher =
  | { field: 'from'; op: 'contains' | 'not_contains' | 'matches_sender'; value: string }
  | { field: 'subject'; op: 'contains' | 'not_contains'; value: string }
  | { field: 'body'; op: 'contains' | 'not_contains'; value: string }
  | { field: 'has_attachment'; op: 'is'; value: 'true' | 'false' }
  | { field: 'detected_action_type'; op: 'includes' | 'not_includes'; value: string };

export interface EmailRuleCondition {
  operator: 'all' | 'any';
  matchers: EmailRuleConditionMatcher[];
}

export type EmailRuleActionType =
  | 'skip'
  | 'skip_actions'
  | 'prepend_instruction'
  | 'apply_label'
  | 'archive_message'
  | 'mark_read'
  | 'star_message';

export type EmailRuleAction =
  | { type: 'skip' }
  | { type: 'skip_actions' }
  | { type: 'prepend_instruction'; instruction?: string }
  | { type: 'apply_label'; labelName: string }
  | { type: 'archive_message' }
  | { type: 'mark_read' }
  | { type: 'star_message' };

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

type BasePayload = { title: string; description: string; sourceSubject?: string; sourceFrom?: string };
export type EmailActionPayload =
  | (BasePayload & { type: 'calendar.add_event'; eventTitle: string; startTime: string; endTime: string; timeZone: string; location?: string; notes?: string })
  | (BasePayload & { type: 'email.draft_reply'; draftSubject?: string; draftBody: string })
  | (BasePayload & { type: 'external.open_link'; url: string })
  | (BasePayload & { type: 'delivery.track_package'; trackingNumber: string; carrier?: string; trackingUrl?: string })
  | (BasePayload & { type: 'travel.track_flight'; flightNumber: string; airline?: string; departureAirport?: string; arrivalAirport?: string; departureTime?: string; trackingUrl?: string })
  | (BasePayload & { type: 'finance.pay_bill'; payee?: string; amount?: string; currency?: string; dueDate?: string; invoiceNumber?: string; paymentUrl?: string })
  | (BasePayload & { type: 'appointment.confirm'; serviceType?: string; providerName?: string; appointmentTime?: string; location?: string; confirmationNumber?: string; notes?: string })
  | (BasePayload & { type: 'manual.todo'; instructions: string });

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
  payload: EmailActionPayload;
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
  eventData?: unknown;
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
