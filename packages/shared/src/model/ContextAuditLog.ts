import type { ContextAuditEventType, ContextAuditLogSeverity } from '../constants';

interface ContextAuditLog {
  id: string;
  contextDocumentId: string;
  applicationId: string;
  userEmail: string;
  sourceDocumentId?: string | null;
  eventType: ContextAuditEventType;
  eventLabel?: string | null;
  eventData?: unknown;
  severity: ContextAuditLogSeverity;
  createdAt: number;
}

interface ContextAuditLogInternal {
  id: string;
  context_document_id: string;
  application_id: string;
  user_email: string;
  source_document_id: string | null;
  event_type: ContextAuditEventType;
  event_label: string | null;
  event_data: string | null;
  severity: ContextAuditLogSeverity;
  created_at: number;
}

interface ContextAuditLogList {
  logs: ContextAuditLog[];
  nextCursor?: string;
}

export type { ContextAuditLog, ContextAuditLogInternal, ContextAuditLogList };
