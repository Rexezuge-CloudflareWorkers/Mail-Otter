import { IntegrationDeliveryLogDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

const BATCH_SIZE: number = 500;

class IntegrationDeliveryLogPruningTask extends IScheduledTask<IntegrationDeliveryLogPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: IntegrationDeliveryLogPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const retentionDays: number = ConfigurationManager.getIntegrationDeliveryLogRetentionDays(env);
    const olderThan: number = Math.floor(Date.now() / 1000) - retentionDays * 86_400;
    const sessionEnv = createD1SessionEnv(env);
    const dao = new IntegrationDeliveryLogDAO(sessionEnv.DB);

    let total: number = 0;
    let deleted: number = BATCH_SIZE;
    while (deleted >= BATCH_SIZE) {
      deleted = await dao.deleteOlderThan(olderThan, BATCH_SIZE);
      total += deleted;
    }
    console.log(`IntegrationDeliveryLogPruningTask: deleted ${total} old delivery log entries`);
  }
}

interface IntegrationDeliveryLogPruningTaskEnv extends IEnv {
  DB: D1Database;
  INTEGRATION_DELIVERY_LOG_RETENTION_DAYS?: string;
}

export { IntegrationDeliveryLogPruningTask };
