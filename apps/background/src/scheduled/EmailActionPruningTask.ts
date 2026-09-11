import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { ActionService } from '@mail-otter/backend-services/action';
import { AbstractPruningTask } from './AbstractPruningTask';
import type { IEnv } from './IScheduledTask';

class EmailActionPruningTask extends AbstractPruningTask<EmailActionPruningTaskEnv> {
  protected getRetentionDays(env: EmailActionPruningTaskEnv): number {
    return ConfigurationManager.getActionRetentionDays(env);
  }

  // Both phases operate on disjoint row sets (expirable pending rows vs. old terminal
  // rows), so running them together per batch drains both correctly: the batch loop only
  // stops once each phase returns fewer rows than the batch size.
  // The cutoff is unused — ActionService derives its own expiry/retention timestamps.
  protected async pruneBatch(env: EmailActionPruningTaskEnv, _db: D1Queryable, _cutoff: number, batchSize: number): Promise<number> {
    const sessionEnv = createD1SessionEnv(env);
    const expired: number = await ActionService.expirePendingActions(sessionEnv, batchSize);
    const deleted: number = await ActionService.deleteOldActions(sessionEnv, batchSize);
    return expired + deleted;
  }
}

interface EmailActionPruningTaskEnv extends IEnv {
  DB: D1Database;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_RETENTION_DAYS?: string;
}

export { EmailActionPruningTask };
