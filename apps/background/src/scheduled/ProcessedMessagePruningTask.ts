import {
  PROCESSED_MESSAGE_STATUS_SKIPPED,
  PROCESSED_MESSAGE_STATUS_SUMMARIZED,
} from '@mail-otter/shared/constants';
import { ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { AbstractPruningTask } from './AbstractPruningTask';
import type { IEnv } from './IScheduledTask';

class ProcessedMessagePruningTask extends AbstractPruningTask<ProcessedMessagePruningTaskEnv> {
  protected getRetentionDays(env: ProcessedMessagePruningTaskEnv): number {
    return ConfigurationManager.getProcessedMessageRetentionDays(env);
  }

  protected pruneBatch(_env: ProcessedMessagePruningTaskEnv, db: D1Queryable, cutoff: number, batchSize: number): Promise<number> {
    return new ProcessedMessageDAO(db).deleteOlderThan(
      cutoff,
      [PROCESSED_MESSAGE_STATUS_SUMMARIZED, PROCESSED_MESSAGE_STATUS_SKIPPED],
      batchSize,
    );
  }
}

interface ProcessedMessagePruningTaskEnv extends IEnv {
  DB: D1Database;
  PROCESSED_MESSAGE_RETENTION_DAYS?: string;
}

export { ProcessedMessagePruningTask };
