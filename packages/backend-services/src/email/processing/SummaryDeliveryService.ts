import { ApplicationContextDAO, ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import { PROCESSED_MESSAGE_STATUS_SUMMARIZED } from '@mail-otter/shared/constants';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import { EmailProcessingAuditLogger } from '../EmailProcessingAuditLogger';
import { classifyPipelineError } from '../EmailPipeline';
import type { EmailProcessingEnv } from './EmailProcessingTypes';

/**
 * Template Method for summary delivery: idempotency check → send → audit.
 *
 * Extracted from `EmailProcessingUtil.sendSummaryTemplate` so per-provider
 * processors share one delivery policy without duplicating DAO/audit code.
 */
class SummaryDeliveryService {
  constructor(
    private readonly env: EmailProcessingEnv,
    private readonly contextDAO?: ApplicationContextDAO,
    private readonly processedDAO?: ProcessedMessageDAO,
  ) {}

  public async sendSummaryTemplate(
    application: ConnectedApplication,
    messageId: string,
    retryAttempt: number | undefined,
    send: () => Promise<void>,
  ): Promise<void> {
    const processedDAO = this.processedDAO ?? new ProcessedMessageDAO(this.env.DB);
    const auditLogger = new EmailProcessingAuditLogger(this.contextDAO ?? new ApplicationContextDAO(this.env.DB));
    const existing = await processedDAO.getByMessageId(application.applicationId, messageId);
    if (existing?.status === PROCESSED_MESSAGE_STATUS_SUMMARIZED) return;
    try {
      await send();
      await auditLogger.logSummarySent(application, messageId, retryAttempt);
      await processedDAO.markSummarized(application.applicationId, messageId);
    } catch (error: unknown) {
      const processingError = classifyPipelineError(error);
      await processedDAO.markError(application.applicationId, messageId, processingError.message);
      await auditLogger.logProcessingError(application, messageId, processingError, retryAttempt);
      throw processingError;
    }
  }
}

export { SummaryDeliveryService };
