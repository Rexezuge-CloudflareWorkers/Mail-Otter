import { ApplicationContextDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

const BATCH_SIZE: number = 500;

class ContextDeletionRunPruningTask extends IScheduledTask<ContextDeletionRunPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: ContextDeletionRunPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const retentionDays: number = ConfigurationManager.getContextDeletionRunRetentionDays(env);
    const olderThan: number = Math.floor(Date.now() / 1000) - retentionDays * 86_400;
    const sessionEnv = createD1SessionEnv(env);
    const dao = new ApplicationContextDAO(sessionEnv.DB);

    let total: number = 0;
    let deleted: number = BATCH_SIZE;
    while (deleted >= BATCH_SIZE) {
      deleted = await dao.deleteOldDeletionRuns(olderThan, BATCH_SIZE);
      total += deleted;
    }
    console.log(`ContextDeletionRunPruningTask: deleted ${total} old deletion runs`);
  }
}

interface ContextDeletionRunPruningTaskEnv extends IEnv {
  DB: D1Database;
  CONTEXT_DELETION_RUN_RETENTION_DAYS?: string;
}

export { ContextDeletionRunPruningTask };
