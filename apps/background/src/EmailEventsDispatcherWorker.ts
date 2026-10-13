import { AbstractQueueWorker } from '@mail-otter/backend-runtime/base';
import { CryptoUtil } from '@mail-otter/shared/utils';
import type { EmailQueueMessage } from '@mail-otter/shared/model';
import { logTokenAdjacentError } from '@mail-otter/shared/utils';

class EmailEventsDispatcherWorker extends AbstractQueueWorker<MessageBatch<EmailQueueMessage>> {
  /**
   * Never log the caught value here.
   *
   * A queue message body *is* an email, and the failure path runs after the
   * message has been decoded, so an interpolated error can carry headers, an
   * `Authorization` value, or the message body itself. `logTokenAdjacentError`
   * takes only a static message and the opaque ids the caller already knows are
   * safe, which is what CodeQL's `js/clear-text-logging` wants and what the kit
   * base's default (`console.error(message, error)`) would have quietly undone.
   */
  protected override reportUnhandled(message: string): void {
    logTokenAdjacentError('error', message);
  }

  protected async onQueue(batch: MessageBatch<EmailQueueMessage>, env: Env, _ctx: ExecutionContext): Promise<void> {
    const workflowInputs: WorkflowInstanceCreateOptions<EmailQueueMessage>[] = await Promise.all(
      batch.messages.map(async (message: Message<EmailQueueMessage>): Promise<WorkflowInstanceCreateOptions<EmailQueueMessage>> => {
        return {
          id: await EmailEventsDispatcherWorker.getWorkflowInstanceId(batch.queue, message.id),
          params: message.body,
        };
      }),
    );

    try {
      await env.EMAIL_PROCESSING_WORKFLOW.createBatch(workflowInputs);
      for (const message of batch.messages) message.ack();
      return;
    } catch {
      logTokenAdjacentError('warn', 'Batch workflow dispatch failed; falling back to per-message dispatch');
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
          logTokenAdjacentError('error', 'Failed to dispatch email event workflow');
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
