import { EmailEventsDispatcherWorker } from '@mail-otter/background';
import { MailOtterWorker } from '@/workers';
import type { EmailQueueMessage } from '@mail-otter/shared/model';
export { CronTasksWorker, EmailProcessingWorkflow, OAuth2TokenRefreshWorker } from '@mail-otter/background';

const mailOtterWorker: MailOtterWorker = new MailOtterWorker();
const emailEventsDispatcherWorker: EmailEventsDispatcherWorker = new EmailEventsDispatcherWorker();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return mailOtterWorker.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    return mailOtterWorker.scheduled(controller, env, ctx);
  },
  /**
   * The platform types a queue batch's body as `unknown`, because a wrangler
   * queue binding carries no schema for what producers enqueue. This repo is
   * both the producer and the consumer, and `EmailEventsDispatcherWorker` casts
   * the body to `EmailQueueMessage` internally — so the assertion is made once,
   * here, where the producer that justifies it is visible, instead of at every
   * read inside the worker. An `EmailQueueMessage` is a small struct of ids and
   * the address to refresh; there is no capability in it to escalate on.
   */
  queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext): Promise<void> {
    return emailEventsDispatcherWorker.queue(batch as MessageBatch<EmailQueueMessage>, env, ctx);
  },
};
