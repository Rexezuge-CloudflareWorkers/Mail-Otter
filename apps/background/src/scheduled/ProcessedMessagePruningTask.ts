import {
  PROCESSED_MESSAGE_STATUS_SKIPPED,
  PROCESSED_MESSAGE_STATUS_SUMMARIZED,
} from '@mail-otter/shared/constants';
import { ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

const BATCH_SIZE: number = 500;

class ProcessedMessagePruningTask extends IScheduledTask<ProcessedMessagePruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: ProcessedMessagePruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const retentionDays: number = ConfigurationManager.getProcessedMessageRetentionDays(env);
    const olderThan: number = Math.floor(Date.now() / 1000) - retentionDays * 86400;
    const sessionEnv = createD1SessionEnv(env);
    const dao = new ProcessedMessageDAO(sessionEnv.DB);

    let total: number = 0;
    let deleted: number = BATCH_SIZE;
    while (deleted >= BATCH_SIZE) {
      deleted = await dao.deleteOlderThan(olderThan, [PROCESSED_MESSAGE_STATUS_SUMMARIZED, PROCESSED_MESSAGE_STATUS_SKIPPED], BATCH_SIZE);
      total += deleted;
    }
    console.log(`ProcessedMessagePruningTask: deleted ${total} rows`);
  }
}

interface ProcessedMessagePruningTaskEnv extends IEnv {
  DB: D1Database;
  PROCESSED_MESSAGE_RETENTION_DAYS?: string | undefined;
}

export { ProcessedMessagePruningTask };
