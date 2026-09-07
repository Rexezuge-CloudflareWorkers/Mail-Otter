import { IntegrationDeliveryLogDAO } from '@mail-otter/backend-data/dao';
import { computeUnixCutoffSeconds, createD1SessionEnv, pruneInBatches } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

class IntegrationDeliveryLogPruningTask extends IScheduledTask<IntegrationDeliveryLogPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: IntegrationDeliveryLogPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const retentionDays: number = ConfigurationManager.getIntegrationDeliveryLogRetentionDays(env);
    const olderThan: number = computeUnixCutoffSeconds(retentionDays);
    const sessionEnv = createD1SessionEnv(env);
    const dao = new IntegrationDeliveryLogDAO(sessionEnv.DB);

    const total = await pruneInBatches((batchSize) => dao.deleteOlderThan(olderThan, batchSize));
    console.log(`IntegrationDeliveryLogPruningTask: deleted ${total} old delivery log entries`);
  }
}

interface IntegrationDeliveryLogPruningTaskEnv extends IEnv {
  DB: D1Database;
  INTEGRATION_DELIVERY_LOG_RETENTION_DAYS?: string;
}

export { IntegrationDeliveryLogPruningTask };
