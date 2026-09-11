import { BackgroundTaskRunDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { AbstractPruningTask } from './AbstractPruningTask';
import type { IEnv } from './IScheduledTask';

class BackgroundTaskRunPruningTask extends AbstractPruningTask<BackgroundTaskRunPruningTaskEnv> {
  protected getRetentionDays(env: BackgroundTaskRunPruningTaskEnv): number {
    return ConfigurationManager.processing.getTaskRunRetentionDays(env);
  }

  protected pruneBatch(_env: BackgroundTaskRunPruningTaskEnv, db: D1Queryable, cutoff: number, batchSize: number): Promise<number> {
    return new BackgroundTaskRunDAO(db).pruneOldRuns(cutoff, batchSize);
  }
}

interface BackgroundTaskRunPruningTaskEnv extends IEnv {
  DB: D1Database;
  BACKGROUND_TASK_RUN_RETENTION_DAYS?: string;
}

export { BackgroundTaskRunPruningTask };
