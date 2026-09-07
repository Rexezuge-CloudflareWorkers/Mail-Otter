import {
  PROCESSED_MESSAGE_STATUS_SKIPPED,
  PROCESSED_MESSAGE_STATUS_SUMMARIZED,
} from '@mail-otter/shared/constants';
import { ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import { computeUnixCutoffSeconds, createD1SessionEnv, pruneInBatches } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

class ProcessedMessagePruningTask extends IScheduledTask<ProcessedMessagePruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: ProcessedMessagePruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const retentionDays: number = ConfigurationManager.getProcessedMessageRetentionDays(env);
    const olderThan: number = computeUnixCutoffSeconds(retentionDays);
    const sessionEnv = createD1SessionEnv(env);
    const dao = new ProcessedMessageDAO(sessionEnv.DB);

    const total = await pruneInBatches((batchSize) =>
      dao.deleteOlderThan(olderThan, [PROCESSED_MESSAGE_STATUS_SUMMARIZED, PROCESSED_MESSAGE_STATUS_SKIPPED], batchSize),
    );
    console.log(`ProcessedMessagePruningTask: deleted ${total} rows`);
  }
}

interface ProcessedMessagePruningTaskEnv extends IEnv {
  DB: D1Database;
  PROCESSED_MESSAGE_RETENTION_DAYS?: string;
}

export { ProcessedMessagePruningTask };
