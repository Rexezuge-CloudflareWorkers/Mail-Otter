import { AbstractQueueWorker } from '@/base';
import { CryptoUtil } from '@mail-otter/shared/utils';
import type { EmailQueueMessage } from '@mail-otter/shared/model';

class EmailEventsDispatcherWorker extends AbstractQueueWorker {
  protected async onQueue(batch: MessageBatch<unknown>, env: Env, _ctx: ExecutionContext): Promise<void> {
    const workflowInputs: WorkflowInstanceCreateOptions<EmailQueueMessage>[] = await Promise.all(
      batch.messages.map(async (message: Message<unknown>): Promise<WorkflowInstanceCreateOptions<EmailQueueMessage>> => {
        return {
          id: await EmailEventsDispatcherWorker.getWorkflowInstanceId(batch.queue, message.id),
          params: message.body as EmailQueueMessage,
        };
      }),
    );

    try {
      await env.EMAIL_PROCESSING_WORKFLOW.createBatch(workflowInputs);
      batch.messages.forEach((message: Message<unknown>): void => message.ack());
      return;
    } catch (error: unknown) {
      console.warn('Batch workflow dispatch failed; falling back to per-message dispatch:', error);
    }

    await Promise.all(
      batch.messages.map(async (message: Message<unknown>, index: number): Promise<void> => {
        try {
          await env.EMAIL_PROCESSING_WORKFLOW.create(workflowInputs[index]);
          message.ack();
        } catch (error: unknown) {
          if (EmailEventsDispatcherWorker.isDuplicateWorkflowError(error)) {
            message.ack();
            return;
          }
          console.error('Failed to dispatch email event workflow:', error);
          message.retry();
        }
      }),
    );
  }

  private static async getWorkflowInstanceId(queueName: string, messageId: string): Promise<string> {
    const hash: string = await CryptoUtil.sha256Hex(`${queueName}:${messageId}`);
    return `emw_${hash.slice(0, 60)}`;
  }

  private static isDuplicateWorkflowError(error: unknown): boolean {
    const message: string = error instanceof Error ? error.message : String(error);
    return /already exists|duplicate|exists/i.test(message);
  }
}

export { EmailEventsDispatcherWorker };
