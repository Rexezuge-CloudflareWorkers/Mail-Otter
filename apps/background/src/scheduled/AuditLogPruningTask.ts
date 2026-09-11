import { ApplicationContextDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { AbstractPruningTask } from './AbstractPruningTask';
import type { IEnv } from './IScheduledTask';

class AuditLogPruningTask extends AbstractPruningTask<AuditLogPruningTaskEnv> {
  protected getRetentionDays(env: AuditLogPruningTaskEnv): number {
    return ConfigurationManager.getContextAuditLogRetentionDays(env);
  }

  protected pruneBatch(_env: AuditLogPruningTaskEnv, db: D1Queryable, cutoff: number, batchSize: number): Promise<number> {
    return new ApplicationContextDAO(db).deleteOldAuditLogs(cutoff, batchSize);
  }
}

interface AuditLogPruningTaskEnv extends IEnv {
  DB: D1Database;
  CONTEXT_AUDIT_LOG_RETENTION_DAYS?: string;
}

export { AuditLogPruningTask };
