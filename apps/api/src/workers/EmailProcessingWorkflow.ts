import { AbstractWorkflowWorker } from '@/base/AbstractWorkflowWorker';
import { EmailProcessingUtil } from '@/utils';
import type { EmailQueueMessage } from '@mail-otter/shared/model';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

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
      async (): Promise<void> => {
        await EmailProcessingUtil.processQueueMessage(event.payload, this.env);
      },
    );
    return {
      processed: true,
      applicationId: event.payload.applicationId,
    };
  }
}

interface EmailProcessingWorkflowResult {
  processed: boolean;
  applicationId: string;
}

export { EmailProcessingWorkflow };
export type { EmailProcessingWorkflowResult };
