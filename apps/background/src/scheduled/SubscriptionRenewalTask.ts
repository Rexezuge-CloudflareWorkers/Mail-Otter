import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { SubscriptionRenewalUtil } from '@mail-otter/backend-services/subscription';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv, TaskRunSummary } from './IScheduledTask';

// Adapter making SubscriptionRenewalUtil a first-class IScheduledTask so
// CronTasksWorker phases stay uniform (Composite pattern).
class SubscriptionRenewalTask extends IScheduledTask<SubscriptionRenewalTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: SubscriptionRenewalTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<TaskRunSummary> {
    await new SubscriptionRenewalUtil(createD1SessionEnv(env)).renewDueSubscriptions();
    return { itemsProcessed: 1, itemsFailed: 0, summary: 'Subscription renewal sweep completed' };
  }
}

interface SubscriptionRenewalTaskEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
}

export { SubscriptionRenewalTask };
