import { ApplicationContextDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

const BATCH_SIZE: number = 500;

class AuditLogPruningTask extends IScheduledTask<AuditLogPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: AuditLogPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const retentionDays: number = ConfigurationManager.getContextAuditLogRetentionDays(env);
    const olderThan: number = Math.floor(Date.now() / 1000) - retentionDays * 86400;
    const sessionEnv = createD1SessionEnv(env);
    const dao = new ApplicationContextDAO(sessionEnv.DB);

    let total: number = 0;
    let deleted: number = BATCH_SIZE;
    while (deleted >= BATCH_SIZE) {
      deleted = await dao.deleteOldAuditLogs(olderThan, BATCH_SIZE);
      total += deleted;
    }
    console.log(`AuditLogPruningTask: deleted ${total} old audit log entries`);
  }
}

interface AuditLogPruningTaskEnv extends IEnv {
  DB: D1Database;
  CONTEXT_AUDIT_LOG_RETENTION_DAYS?: string | undefined;
}

export { AuditLogPruningTask };
