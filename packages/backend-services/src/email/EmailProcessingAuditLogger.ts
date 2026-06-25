import {
  CONTEXT_AUDIT_EVENT_ACTION_CREATED,
  CONTEXT_AUDIT_EVENT_ATTACHMENT_ANALYZED,
  CONTEXT_AUDIT_EVENT_ERROR,
  CONTEXT_AUDIT_EVENT_MODEL_FALLBACK,
  CONTEXT_AUDIT_EVENT_PROCESSING_STARTED,
  CONTEXT_AUDIT_EVENT_SUMMARY_GENERATED,
  CONTEXT_AUDIT_EVENT_SUMMARY_SENT,
  CONTEXT_AUDIT_LOG_SEVERITY_ERROR,
  CONTEXT_AUDIT_LOG_SEVERITY_INFO,
  CONTEXT_AUDIT_LOG_SEVERITY_WARNING,
  SOURCE_TYPE_EMAIL,
} from '@mail-otter/shared/constants';
import { ApplicationContextDAO } from '@mail-otter/backend-data/dao';
import { NonRetryableError } from '@mail-otter/backend-errors';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import type { CreatedEmailAction } from '../action';

class EmailProcessingAuditLogger {
  constructor(private readonly contextDAO: ApplicationContextDAO) {}

  async logProcessingStarted(application: ConnectedApplication, sourceDocumentId: string, retryAttempt?: number): Promise<void> {
    return this.logAuditEvent(
      application,
      sourceDocumentId,
      CONTEXT_AUDIT_EVENT_PROCESSING_STARTED,
      'Email Processing Started',
      CONTEXT_AUDIT_LOG_SEVERITY_INFO,
      retryAttempt != null && retryAttempt > 1 ? { attempt: retryAttempt } : undefined,
    );
  }

  async logSummaryGenerated(application: ConnectedApplication, sourceDocumentId: string, model: string, estimatedNeurons: number, retryAttempt?: number): Promise<void> {
    return this.logAuditEvent(
      application,
      sourceDocumentId,
      CONTEXT_AUDIT_EVENT_SUMMARY_GENERATED,
      'AI Summary Generated',
      CONTEXT_AUDIT_LOG_SEVERITY_INFO,
      {
        summaryModel: model,
        estimatedNeurons,
        ...(retryAttempt != null && retryAttempt > 1 && { attempt: retryAttempt }),
      },
    );
  }

  async logActionsCreated(
    application: ConnectedApplication,
    sourceDocumentId: string,
    actions: CreatedEmailAction[],
    retryAttempt?: number,
  ): Promise<void> {
    return this.logAuditEvent(
      application,
      sourceDocumentId,
      CONTEXT_AUDIT_EVENT_ACTION_CREATED,
      'Actions Created From AI Summary',
      CONTEXT_AUDIT_LOG_SEVERITY_INFO,
      {
        actionCount: actions.length,
        actionTypes: actions.map((a) => a.action.actionType),
        ...(retryAttempt != null && retryAttempt > 1 && { attempt: retryAttempt }),
      },
    );
  }

  async logSummarySent(application: ConnectedApplication, sourceDocumentId: string, retryAttempt?: number): Promise<void> {
    return this.logAuditEvent(
      application,
      sourceDocumentId,
      CONTEXT_AUDIT_EVENT_SUMMARY_SENT,
      'Summary Email Sent',
      CONTEXT_AUDIT_LOG_SEVERITY_INFO,
      retryAttempt != null && retryAttempt > 1 ? { attempt: retryAttempt } : undefined,
    );
  }

  async logAttachmentAnalysis(
    application: ConnectedApplication,
    sourceDocumentId: string,
    visionModel: string,
    attachmentCount: number,
    estimatedNeurons: number,
    retryAttempt?: number,
  ): Promise<void> {
    return this.logAuditEvent(
      application,
      sourceDocumentId,
      CONTEXT_AUDIT_EVENT_ATTACHMENT_ANALYZED,
      'Attachment Vision Analysis',
      CONTEXT_AUDIT_LOG_SEVERITY_INFO,
      {
        visionModel,
        attachmentCount,
        estimatedNeurons,
        ...(retryAttempt != null && retryAttempt > 1 && { attempt: retryAttempt }),
      },
    );
  }

  async logModelFallback(application: ConnectedApplication, sourceDocumentId: string, primaryModel: string, error: Error): Promise<void> {
    return this.logAuditEvent(
      application,
      sourceDocumentId,
      CONTEXT_AUDIT_EVENT_MODEL_FALLBACK,
      'AI Summary Model Fallback',
      CONTEXT_AUDIT_LOG_SEVERITY_WARNING,
      { primaryModel, error: error.message, errorType: error.constructor?.name },
    );
  }

  async logProcessingError(application: ConnectedApplication, sourceDocumentId: string, error: Error, retryAttempt?: number): Promise<void> {
    return this.logAuditEvent(
      application,
      sourceDocumentId,
      CONTEXT_AUDIT_EVENT_ERROR,
      'Email Processing Error',
      error instanceof NonRetryableError ? CONTEXT_AUDIT_LOG_SEVERITY_ERROR : CONTEXT_AUDIT_LOG_SEVERITY_WARNING,
      { error: error.message, errorType: error.constructor?.name, ...(retryAttempt != null && retryAttempt > 1 && { attempt: retryAttempt }) },
    );
  }

  private async logAuditEvent(
    application: ConnectedApplication,
    sourceDocumentId: string,
    eventType: Parameters<ApplicationContextDAO['insertAuditLog']>[0]['eventType'],
    eventLabel: string,
    severity: Parameters<ApplicationContextDAO['insertAuditLog']>[0]['severity'],
    eventData?: unknown,
  ): Promise<void> {
    const contextDocumentId = await this.getContextDocumentId(application, sourceDocumentId);
    if (!contextDocumentId) return;
    await this.tryInsertAuditLog({
      contextDocumentId,
      applicationId: application.applicationId,
      userEmail: application.userEmail,
      sourceDocumentId,
      eventType,
      eventLabel,
      eventData,
      severity,
    });
  }

  private async getContextDocumentId(application: ConnectedApplication, sourceDocumentId: string): Promise<string | undefined> {
    try {
      return await this.contextDAO.getContextDocumentIdBySource(application.applicationId, sourceDocumentId, SOURCE_TYPE_EMAIL);
    } catch {
      return undefined;
    }
  }

  private async tryInsertAuditLog(
    params: Omit<Parameters<ApplicationContextDAO['insertAuditLog']>[0], 'contextDocumentId' | 'applicationId' | 'userEmail'> & {
      contextDocumentId: string;
      applicationId: string;
      userEmail: string;
    },
  ): Promise<void> {
    try {
      await this.contextDAO.insertAuditLog(params);
    } catch {
      // audit logging is non-critical; silently ignore failures
    }
  }
}

export { EmailProcessingAuditLogger };
