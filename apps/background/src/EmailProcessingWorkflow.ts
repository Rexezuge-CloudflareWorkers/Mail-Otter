import { AbstractWorkflowWorker } from '@mail-otter/backend-runtime/base';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { DatabaseError, NonRetryableError, RetryableError } from '@mail-otter/backend-errors';
import { EmailProcessingUtil } from '@mail-otter/backend-services/email';
import type { GmailMessageList, GmailSummaryData, OutlookSummaryData, ResolvedApplication } from '@mail-otter/backend-services/email';
import { IntegrationService } from '@mail-otter/backend-services/integration';
import type { EmailQueueMessage } from '@mail-otter/shared/model';
import type { WorkflowEvent, WorkflowStep, WorkflowStepContext } from 'cloudflare:workers';
import { NonRetryableError as WorkflowNonRetryableError } from 'cloudflare:workflows';

class EmailProcessingWorkflow extends AbstractWorkflowWorker<EmailQueueMessage, EmailProcessingWorkflowResult> {
  protected async onWorkflow(
    event: Readonly<WorkflowEvent<EmailQueueMessage>>,
    step: WorkflowStep,
  ): Promise<EmailProcessingWorkflowResult> {
    const resolved = await step.do(
      'Resolve Application',
      { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
      async (): Promise<ResolvedApplication> => {
        try {
          return await EmailProcessingUtil.resolveApplication(event.payload, createD1SessionEnv(this.env));
        } catch (error: unknown) {
          throw EmailProcessingWorkflow.toWorkflowError(error);
        }
      },
    );

    if (event.payload.type === 'gmail-notification') {
      const gmailPayload = event.payload;
      const messageList = await step.do(
        'List Gmail Messages',
        { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
        async (): Promise<GmailMessageList | null> => {
          try {
            return await EmailProcessingUtil.listGmailMessages(
              resolved.application,
              resolved.accessToken,
              gmailPayload.notificationHistoryId,
              createD1SessionEnv(this.env),
            );
          } catch (error: unknown) {
            throw EmailProcessingWorkflow.toWorkflowError(error);
          }
        },
      );

      if (messageList) {
        for (const messageId of messageList.messageIds) {
          const summaryData = await step.do(
            `Generate Gmail Summary for ${messageId}`,
            { retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' }, timeout: '5 minutes' },
            async (context: WorkflowStepContext): Promise<GmailSummaryData | null> => {
              try {
                return await EmailProcessingUtil.generateGmailSummary(
                  resolved.application,
                  resolved.accessToken,
                  messageId,
                  createD1SessionEnv(this.env),
                  resolved.enabledApplicationIds,
                  { retryAttempt: context.attempt, callbackBaseUrl: event.payload.callbackBaseUrl },
                );
              } catch (error: unknown) {
                throw EmailProcessingWorkflow.toWorkflowError(error);
              }
            },
          );

          if (summaryData) {
            await step.do(
              `Send Gmail Summary for ${messageId}`,
              { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
              async (): Promise<void> => {
                try {
                  await EmailProcessingUtil.sendGmailSummary(summaryData, createD1SessionEnv(this.env));
                } catch (error: unknown) {
                  throw EmailProcessingWorkflow.toWorkflowError(error);
                }
              },
            );

            await step.do(
              `Send To Integrations for ${messageId}`,
              { retries: { limit: 2, delay: '5 seconds', backoff: 'linear' }, timeout: '1 minute' },
              async (): Promise<void> => {
                try {
                  await IntegrationService.sendToIntegrations(summaryData, createD1SessionEnv(this.env));
                } catch (error: unknown) {
                  throw EmailProcessingWorkflow.toWorkflowError(error);
                }
              },
            );
          }
        }

        await step.do(
          'Update Gmail History',
          { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
          async (): Promise<void> => {
            try {
              await EmailProcessingUtil.updateGmailHistory(
                messageList.subscriptionId,
                messageList.historyId,
                createD1SessionEnv(this.env),
              );
            } catch (error: unknown) {
              throw EmailProcessingWorkflow.toWorkflowError(error);
            }
          },
        );
      }
    } else if (event.payload.type === 'outlook-notification') {
      const outlookPayload = event.payload;
      const summaryData = await step.do(
        'Generate Outlook Summary',
        { retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' }, timeout: '5 minutes' },
        async (context: WorkflowStepContext): Promise<OutlookSummaryData | null> => {
          try {
            return await EmailProcessingUtil.generateOutlookSummary(
              resolved.application,
              resolved.accessToken,
              outlookPayload.messageId,
              createD1SessionEnv(this.env),
              resolved.enabledApplicationIds,
              { retryAttempt: context.attempt, callbackBaseUrl: event.payload.callbackBaseUrl },
            );
          } catch (error: unknown) {
            throw EmailProcessingWorkflow.toWorkflowError(error);
          }
        },
      );

      if (summaryData) {
        await step.do(
          'Send Outlook Summary',
          { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
          async (): Promise<void> => {
            try {
              await EmailProcessingUtil.sendOutlookSummary(summaryData, createD1SessionEnv(this.env));
            } catch (error: unknown) {
              throw EmailProcessingWorkflow.toWorkflowError(error);
            }
          },
        );

        await step.do(
          'Send To Integrations',
          { retries: { limit: 2, delay: '5 seconds', backoff: 'linear' }, timeout: '1 minute' },
          async (): Promise<void> => {
            try {
              await IntegrationService.sendToIntegrations(summaryData, createD1SessionEnv(this.env));
            } catch (error: unknown) {
              throw EmailProcessingWorkflow.toWorkflowError(error);
            }
          },
        );
      }
    }

    return {
      processed: true,
      applicationId: event.payload.applicationId,
    };
  }

  private static toWorkflowError(error: unknown): Error {
    if (error instanceof NonRetryableError) {
      return new WorkflowNonRetryableError(error.message, error.name);
    }
    if (error instanceof RetryableError) {
      return error;
    }
    if (error instanceof DatabaseError) {
      if (!error.retryable) {
        return new WorkflowNonRetryableError(error.message, 'DatabaseError');
      }
      return new RetryableError(error.message);
    }
    if (error instanceof Error) {
      return new RetryableError(error.message);
    }
    return new RetryableError(String(error));
  }
}

interface EmailProcessingWorkflowResult {
  processed: boolean;
  applicationId: string;
}

export { EmailProcessingWorkflow };
export type { EmailProcessingWorkflowResult };
