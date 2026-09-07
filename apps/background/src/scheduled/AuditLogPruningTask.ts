import { ApplicationContextDAO } from '@mail-otter/backend-data/dao';
import { computeUnixCutoffSeconds, createD1SessionEnv, pruneInBatches } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

class AuditLogPruningTask extends IScheduledTask<AuditLogPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: AuditLogPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const retentionDays: number = ConfigurationManager.getContextAuditLogRetentionDays(env);
    const olderThan: number = computeUnixCutoffSeconds(retentionDays);
    const sessionEnv = createD1SessionEnv(env);
    const dao = new ApplicationContextDAO(sessionEnv.DB);

    const total = await pruneInBatches((batchSize) => dao.deleteOldAuditLogs(olderThan, batchSize));
    console.log(`AuditLogPruningTask: deleted ${total} old audit log entries`);
  }
}

interface AuditLogPruningTaskEnv extends IEnv {
  DB: D1Database;
  CONTEXT_AUDIT_LOG_RETENTION_DAYS?: string;
}

export { AuditLogPruningTask };
