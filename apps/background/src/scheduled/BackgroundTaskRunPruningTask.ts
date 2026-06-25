import { BackgroundTaskRunDAO } from '@mail-otter/backend-data/dao';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv, TaskRunSummary } from './IScheduledTask';

class BackgroundTaskRunPruningTask extends IScheduledTask<BackgroundTaskRunPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: BackgroundTaskRunPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<TaskRunSummary> {
    const retentionDays = ConfigurationManager.processing.getTaskRunRetentionDays(env);
    const cutoff = TimestampUtil.getCurrentUnixTimestampInSeconds() - retentionDays * 86_400;
    const dao = new BackgroundTaskRunDAO(env.DB);
    const deleted = await dao.pruneOldRuns(cutoff, 500);
    return { itemsProcessed: deleted, itemsFailed: 0 };
  }
}

interface BackgroundTaskRunPruningTaskEnv extends IEnv {
  DB: D1Database;
  BACKGROUND_TASK_RUN_RETENTION_DAYS?: string;
}

export { BackgroundTaskRunPruningTask };
