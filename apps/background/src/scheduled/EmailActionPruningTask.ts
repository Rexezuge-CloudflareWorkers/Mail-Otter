import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { ActionService } from '@mail-otter/backend-services/action';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

const BATCH_SIZE: number = 500;

class EmailActionPruningTask extends IScheduledTask<EmailActionPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: EmailActionPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const sessionEnv = createD1SessionEnv(env);
    let expiredTotal = 0;
    let expired = BATCH_SIZE;
    while (expired >= BATCH_SIZE) {
      expired = await ActionService.expirePendingActions(sessionEnv, BATCH_SIZE);
      expiredTotal += expired;
    }

    let deletedTotal = 0;
    let deleted = BATCH_SIZE;
    while (deleted >= BATCH_SIZE) {
      deleted = await ActionService.deleteOldActions(sessionEnv, BATCH_SIZE);
      deletedTotal += deleted;
    }
    console.log(`EmailActionPruningTask: expired ${expiredTotal} rows, deleted ${deletedTotal} rows`);
  }
}

interface EmailActionPruningTaskEnv extends IEnv {
  DB: D1Database;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_RETENTION_DAYS?: string | undefined;
}

export { EmailActionPruningTask };
