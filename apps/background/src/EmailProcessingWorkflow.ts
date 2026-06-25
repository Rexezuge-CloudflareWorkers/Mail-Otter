import { AbstractWorkflowWorker } from '@mail-otter/backend-runtime/base';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { DatabaseError, NonRetryableError, OAuth2TokenNonRetryableError, RetryableError } from '@mail-otter/backend-errors';
import { EmailProcessingUtil } from '@mail-otter/backend-services/email';
import type { GmailMessageList, GmailSummaryData, ImapSummaryData, JmapSummaryData, OutlookSummaryData, ResolvedApplication } from '@mail-otter/backend-services/email';
import { IntegrationService } from '@mail-otter/backend-services/integration';
import { CONNECTION_METHOD_IMAP_PASSWORD } from '@mail-otter/shared/constants';
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

    switch (event.payload.type) {
    case 'gmail-notification': {
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
                  await new IntegrationService(createD1SessionEnv(this.env)).sendToIntegrations(summaryData);
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
    
    break;
    }
    case 'outlook-notification': {
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
              await new IntegrationService(createD1SessionEnv(this.env)).sendToIntegrations(summaryData);
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
            return await EmailProcessingUtil.generateJmapSummary(
              resolved.application,
              resolved.accessToken,
              jmapPayload.emailId,
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
          `Send JMAP Summary for ${jmapPayload.emailId}`,
          { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
          async (): Promise<void> => {
            try {
              await EmailProcessingUtil.sendJmapSummary(summaryData, createD1SessionEnv(this.env));
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
              await new IntegrationService(createD1SessionEnv(this.env)).sendToIntegrations(summaryData);
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
      const imapConnectOptions = EmailProcessingWorkflow.buildImapConnectOptions(resolved.application, resolved.accessToken, isImapPassword);
      const imapClient = new ImapClient();
      try {
        await imapClient.connect(imapConnectOptions);

        for (const uid of imapPayload.messageUids) {
          const summaryData = await step.do(
            `Generate IMAP Summary for UID ${uid}`,
            { retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' }, timeout: '5 minutes' },
            async (context: WorkflowStepContext): Promise<ImapSummaryData | null> => {
              try {
                return await EmailProcessingUtil.generateImapSummary(
                  resolved.application,
                  uid,
                  imapClient,
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
              `Send IMAP Summary for UID ${uid}`,
              { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
              async (): Promise<void> => {
                try {
                  await EmailProcessingUtil.sendImapSummary(summaryData, imapClient, createD1SessionEnv(this.env));
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
                  await new IntegrationService(createD1SessionEnv(this.env)).sendToIntegrations(summaryData);
                } catch (error: unknown) {
                  throw EmailProcessingWorkflow.toWorkflowError(error);
                }
              },
            );
          }
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

  private static buildImapConnectOptions(application: ConnectedApplication, accessToken: string, isImapPassword: boolean): ImapConnectOptions {
    const PROVIDER_IMAP_DEFAULTS: Record<string, { host: string; port: number }> = {
      'google-gmail': { host: 'imap.gmail.com', port: 993 },
      'microsoft-outlook': { host: 'outlook.office365.com', port: 993 },
      'fastmail-jmap': { host: 'imap.fastmail.com', port: 993 },
      'yahoo-mail': { host: 'imap.mail.yahoo.com', port: 993 },
      'apple-icloud': { host: 'imap.mail.me.com', port: 993 },
    };
    const defaults = PROVIDER_IMAP_DEFAULTS[application.providerId];
    const host = application.imapHost ?? defaults?.host ?? 'localhost';
    const port = application.imapPort ?? defaults?.port ?? 993;
    const username = application.imapUsername ?? application.providerEmail ?? '';
    if (isImapPassword) {
      return { host, port, username, auth: { method: 'PLAIN', password: application.imapPassword ?? '' } };
    }
    return { host, port, username, auth: { method: 'XOAUTH2', accessToken } };
  }

  private static toWorkflowError(error: unknown): Error {
    // OAuth2 4xx from the Durable Object can be transient (cold-start, network hiccup);
    // let the step's configured retry policy handle it rather than killing the workflow immediately.
    if (error instanceof OAuth2TokenNonRetryableError) {
      console.error('[Workflow] OAuth2 token error (will retry via step policy):', error.message);
      return new RetryableError(error.message);
    }
    if (error instanceof NonRetryableError) {
      console.error('[Workflow] Non-retryable error (permanent failure):', error.constructor.name, error.message);
      return new WorkflowNonRetryableError(error.message, error.name);
    }
    if (error instanceof RetryableError) {
      return error;
    }
    if (error instanceof DatabaseError) {
      if (!error.retryable) {
        console.error('[Workflow] Non-retryable database error (permanent failure):', error.message);
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
