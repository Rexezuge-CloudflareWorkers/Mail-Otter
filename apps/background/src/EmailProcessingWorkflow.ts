import { AbstractWorkflowWorker } from '@mail-otter/backend-runtime/base';
import { NonRetryableError, RetryableError } from '@mail-otter/backend-errors';
import { EmailProcessingUtil } from '@mail-otter/backend-services/email';
import type { EmailQueueMessage } from '@mail-otter/shared/model';
import type { WorkflowEvent, WorkflowStep, WorkflowStepContext } from 'cloudflare:workers';
import { NonRetryableError as WorkflowNonRetryableError } from 'cloudflare:workflows';

class EmailProcessingWorkflow extends AbstractWorkflowWorker<EmailQueueMessage, EmailProcessingWorkflowResult> {
  protected async onWorkflow(
    event: Readonly<WorkflowEvent<EmailQueueMessage>>,
    step: WorkflowStep,
  ): Promise<EmailProcessingWorkflowResult> {
    await step.do(
      'process email event',
      {
        retries: {
          limit: 5,
          delay: '30 seconds',
          backoff: 'exponential',
        },
        timeout: '10 minutes',
      },
      async (context: WorkflowStepContext): Promise<void> => {
        try {
          await EmailProcessingUtil.processQueueMessage(event.payload, this.env, { retryAttempt: context.attempt });
        } catch (error: unknown) {
          throw EmailProcessingWorkflow.toWorkflowError(error);
        }
      },
    );
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
