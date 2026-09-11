import { IntegrationDeliveryLogDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { AbstractPruningTask } from './AbstractPruningTask';
import type { IEnv } from './IScheduledTask';

class IntegrationDeliveryLogPruningTask extends AbstractPruningTask<IntegrationDeliveryLogPruningTaskEnv> {
  protected getRetentionDays(env: IntegrationDeliveryLogPruningTaskEnv): number {
    return ConfigurationManager.getIntegrationDeliveryLogRetentionDays(env);
  }

  protected pruneBatch(_env: IntegrationDeliveryLogPruningTaskEnv, db: D1Queryable, cutoff: number, batchSize: number): Promise<number> {
    return new IntegrationDeliveryLogDAO(db).deleteOlderThan(cutoff, batchSize);
  }
}

interface IntegrationDeliveryLogPruningTaskEnv extends IEnv {
  DB: D1Database;
  INTEGRATION_DELIVERY_LOG_RETENTION_DAYS?: string;
}

export { IntegrationDeliveryLogPruningTask };
