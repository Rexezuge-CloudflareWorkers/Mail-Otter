import { createD1SessionEnv, pruneInBatches } from '@mail-otter/backend-data/utils';
import { ActionService } from '@mail-otter/backend-services/action';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

class EmailActionPruningTask extends IScheduledTask<EmailActionPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: EmailActionPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const sessionEnv = createD1SessionEnv(env);
    const expiredTotal = await pruneInBatches((batchSize) => ActionService.expirePendingActions(sessionEnv, batchSize));

    const deletedTotal = await pruneInBatches((batchSize) => ActionService.deleteOldActions(sessionEnv, batchSize));
    console.log(`EmailActionPruningTask: expired ${expiredTotal} rows, deleted ${deletedTotal} rows`);
  }
}

interface EmailActionPruningTaskEnv extends IEnv {
  DB: D1Database;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_RETENTION_DAYS?: string;
}

export { EmailActionPruningTask };
