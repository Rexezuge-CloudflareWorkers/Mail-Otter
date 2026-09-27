import { logError } from '@mail-otter/shared/utils';
abstract class AbstractQueueWorker {
  public async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      await this.onQueue(batch, env, ctx);
    } catch (err: unknown) {
      logError('error', 'Unhandled error in queue():', err);
      throw err;
    }
  }

  protected abstract onQueue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext): Promise<void>;
}

export { AbstractQueueWorker };
