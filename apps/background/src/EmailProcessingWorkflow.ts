import { AbstractWorkflowWorker } from '@mail-otter/backend-runtime/base';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { DatabaseError, NonRetryableError, OAuth2TokenNonRetryableError, RetryableError } from '@mail-otter/backend-errors';
import {
  EmailApplicationResolver,
  GmailMessageProcessor,
  ImapMessageProcessor,
  JmapMessageProcessor,
  OutlookMessageProcessor,
} from '@mail-otter/backend-services/email';
import type {
  GmailMessageList,
  GmailSummaryData,
  ImapSummaryData,
  JmapSummaryData,
  OutlookSummaryData,
  ResolvedApplication,
} from '@mail-otter/backend-services/email';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';
import { buildImapConnectOptions } from '@mail-otter/backend-services/provider';
import { IntegrationService } from '@mail-otter/backend-services/integration';
import { CONNECTION_METHOD_IMAP_PASSWORD } from '@mail-otter/shared/constants';
import { logError, logTokenAdjacentError } from '@mail-otter/shared/utils';
import type { ConnectedApplication, EmailQueueMessage } from '@mail-otter/shared/model';
import { ImapClient } from '@mail-otter/provider-clients/imap';
import type { ImapConnectOptions } from '@mail-otter/provider-clients/imap';
import type { WorkflowEvent, WorkflowStep, WorkflowStepContext } from 'cloudflare:workers';
import { NonRetryableError as WorkflowNonRetryableError } from 'cloudflare:workflows';

class EmailProcessingWorkflow extends AbstractWorkflowWorker<EmailQueueMessage, EmailProcessingWorkflowResult> {
  protected async onWorkflow(
    event: Readonly<WorkflowEvent<EmailQueueMessage>>,
    step: WorkflowStep,
  ): Promise<EmailProcessingWorkflowResult> {
    const sessionEnv = createD1SessionEnv(this.env);
    const scope = createRequestScope(sessionEnv);
    const resolved = await step.do(
      'Resolve Application',
      { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
      async (): Promise<ResolvedApplication> => {
        try {
          return await new EmailApplicationResolver(createD1SessionEnv(this.env)).resolveApplication(event.payload);
        } catch (error: unknown) {
          throw EmailProcessingWorkflow.toWorkflowError(error);
        }
      },
    );

    switch (event.payload.type) {
      case 'gmail-notification': {
        const gmailPayload = event.payload;
        const messageList = await step.do(
          'List Gmail Messages',
          { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
          async (): Promise<GmailMessageList | null> => {
            try {
              return await new EmailApplicationResolver(createD1SessionEnv(this.env)).listGmailMessages(
                resolved.application,
                resolved.accessToken,
                gmailPayload.notificationHistoryId,
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
                  return await new GmailMessageProcessor(createD1SessionEnv(this.env)).generateSummary(
                    resolved.application,
                    resolved.accessToken,
                    messageId,
                    resolved.enabledApplicationIds,
                    { retryAttempt: context.attempt, callbackBaseUrl: event.payload.callbackBaseUrl },
                  );
                } catch (error: unknown) {
                  throw EmailProcessingWorkflow.toWorkflowError(error);
                }
              },
            );

            if (!summaryData) {
              continue;
            }

            await step.do(
              `Send Gmail Summary for ${messageId}`,
              { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
              async (): Promise<void> => {
                try {
                  await new GmailMessageProcessor(createD1SessionEnv(this.env)).sendSummary(summaryData);
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
                  await scope.get<IntegrationService>(Tokens.IntegrationService).sendToIntegrations(summaryData);
                } catch (error: unknown) {
                  throw EmailProcessingWorkflow.toWorkflowError(error);
                }
              },
            );
          }

          await step.do(
            'Update Gmail History',
            { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
            async (): Promise<void> => {
              try {
                await new EmailApplicationResolver(createD1SessionEnv(this.env)).updateGmailHistory(
                  messageList.subscriptionId,
                  messageList.historyId,
                );
              } catch (error: unknown) {
                throw EmailProcessingWorkflow.toWorkflowError(error);
              }
            },
          );
        }

        break;
      }
      case 'outlook-notification': {
        const outlookPayload = event.payload;
        const summaryData = await step.do(
          'Generate Outlook Summary',
          { retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' }, timeout: '5 minutes' },
          async (context: WorkflowStepContext): Promise<OutlookSummaryData | null> => {
            try {
              return await new OutlookMessageProcessor(createD1SessionEnv(this.env)).generateSummary(
                resolved.application,
                resolved.accessToken,
                outlookPayload.messageId,
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
                await new OutlookMessageProcessor(createD1SessionEnv(this.env)).sendSummary(summaryData);
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
                await scope.get<IntegrationService>(Tokens.IntegrationService).sendToIntegrations(summaryData);
              } catch (error: unknown) {
                throw EmailProcessingWorkflow.toWorkflowError(error);
              }
            },
          );
        }

        break;
      }
      case 'jmap-notification': {
        const jmapPayload = event.payload;
        const summaryData = await step.do(
          `Generate JMAP Summary for ${jmapPayload.emailId}`,
          { retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' }, timeout: '5 minutes' },
          async (context: WorkflowStepContext): Promise<JmapSummaryData | null> => {
            try {
              return await new JmapMessageProcessor(createD1SessionEnv(this.env)).generateSummary(
                resolved.application,
                resolved.accessToken,
                jmapPayload.emailId,
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
            `Send JMAP Summary for ${jmapPayload.emailId}`,
            { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
            async (): Promise<void> => {
              try {
                await new JmapMessageProcessor(createD1SessionEnv(this.env)).sendSummary(summaryData);
              } catch (error: unknown) {
                throw EmailProcessingWorkflow.toWorkflowError(error);
              }
            },
          );

          await step.do(
            `Send To Integrations for ${jmapPayload.emailId}`,
            { retries: { limit: 2, delay: '5 seconds', backoff: 'linear' }, timeout: '1 minute' },
            async (): Promise<void> => {
              try {
                await scope.get<IntegrationService>(Tokens.IntegrationService).sendToIntegrations(summaryData);
              } catch (error: unknown) {
                throw EmailProcessingWorkflow.toWorkflowError(error);
              }
            },
          );
        }

        break;
      }
      case 'imap-notification': {
        const imapPayload = event.payload;
        const isImapPassword = resolved.application.connectionMethod === CONNECTION_METHOD_IMAP_PASSWORD;
        const imapConnectOptions = EmailProcessingWorkflow.buildImapConnectOptions(
          resolved.application,
          resolved.accessToken,
          isImapPassword,
        );
        const imapClient = new ImapClient();
        try {
          await imapClient.connect(imapConnectOptions);

          for (const uid of imapPayload.messageUids) {
            const summaryData = await step.do(
              `Generate IMAP Summary for UID ${uid}`,
              { retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' }, timeout: '5 minutes' },
              async (context: WorkflowStepContext): Promise<ImapSummaryData | null> => {
                try {
                  return await new ImapMessageProcessor(createD1SessionEnv(this.env)).generateSummary(
                    resolved.application,
                    uid,
                    imapClient,
                    resolved.enabledApplicationIds,
                    { retryAttempt: context.attempt, callbackBaseUrl: event.payload.callbackBaseUrl },
                  );
                } catch (error: unknown) {
                  throw EmailProcessingWorkflow.toWorkflowError(error);
                }
              },
            );

            if (!summaryData) {
              continue;
            }

            await step.do(
              `Send IMAP Summary for UID ${uid}`,
              { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
              async (): Promise<void> => {
                try {
                  await new ImapMessageProcessor(createD1SessionEnv(this.env)).sendSummary(summaryData, imapClient);
                } catch (error: unknown) {
                  throw EmailProcessingWorkflow.toWorkflowError(error);
                }
              },
            );

            await step.do(
              `Send To Integrations for UID ${uid}`,
              { retries: { limit: 2, delay: '5 seconds', backoff: 'linear' }, timeout: '1 minute' },
              async (): Promise<void> => {
                try {
                  await scope.get<IntegrationService>(Tokens.IntegrationService).sendToIntegrations(summaryData);
                } catch (error: unknown) {
                  throw EmailProcessingWorkflow.toWorkflowError(error);
                }
              },
            );
          }
        } finally {
          await imapClient.close();
        }

        break;
      }
      // No default
    }

    return {
      processed: true,
      applicationId: event.payload.applicationId,
    };
  }

  private static buildImapConnectOptions(
    application: ConnectedApplication,
    accessToken: string,
    isImapPassword: boolean,
  ): ImapConnectOptions {
    // Single source of defaults lives in `ImapConnectionFactory`; this wrapper
    // remains so existing unit tests mocking the workflow keep working.
    return buildImapConnectOptions(application, accessToken, isImapPassword);
  }

  private static toWorkflowError(error: unknown): Error {
    // OAuth2 4xx from the Durable Object can be transient (cold-start, network hiccup);
    // let the step's configured retry policy handle it rather than killing the workflow immediately.
    if (error instanceof OAuth2TokenNonRetryableError) {
      // Token-adjacent: log the classification only. The OAuth2 DO's error text
      // can carry credentials, and `js/clear-text-logging` traces that taint.
      logTokenAdjacentError('error', '[Workflow] OAuth2 token error (will retry via step policy)');
      return new RetryableError(error.message);
    }
    if (error instanceof NonRetryableError) {
      logError('error', `[Workflow] Non-retryable error (permanent failure): ${error.constructor.name}`, error);
      return new WorkflowNonRetryableError(error.message, error.name);
    }
    if (error instanceof RetryableError) {
      return error;
    }
    if (error instanceof DatabaseError) {
      if (!error.retryable) {
        logError('error', '[Workflow] Non-retryable database error (permanent failure)', error);
        return new WorkflowNonRetryableError(error.message, 'DatabaseError');
      }
      return new RetryableError(error.message);
    }
    return new RetryableError(error instanceof Error ? error.message : String(error));
  }
}

interface EmailProcessingWorkflowResult {
  processed: boolean;
  applicationId: string;
}

export { EmailProcessingWorkflow };
export type { EmailProcessingWorkflowResult };
