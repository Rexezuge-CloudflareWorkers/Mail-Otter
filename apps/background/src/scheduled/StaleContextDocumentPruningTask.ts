import { ApplicationContextDAO } from '@mail-otter/backend-data/dao';
import { computeUnixCutoffSeconds, createD1SessionEnv, pruneInBatches } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

class StaleContextDocumentPruningTask extends IScheduledTask<StaleContextDocumentPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: StaleContextDocumentPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const deletedGraceDays: number = ConfigurationManager.getStaleContextDocumentDeletedGraceDays(env);
    const errorGraceDays: number = ConfigurationManager.getStaleContextDocumentErrorGraceDays(env);
    const deletedBefore: number = computeUnixCutoffSeconds(deletedGraceDays);
    const errorBefore: number = computeUnixCutoffSeconds(errorGraceDays);
    const sessionEnv = createD1SessionEnv(env);
    const dao = new ApplicationContextDAO(sessionEnv.DB);

    const totalDeleted = await pruneInBatches((batchSize) => dao.deleteStaleDeletedDocuments(deletedBefore, batchSize));
    console.log(`StaleContextDocumentPruningTask: deleted ${totalDeleted} stale deleted documents`);

    const totalError = await pruneInBatches((batchSize) => dao.deleteStaleErrorDocuments(errorBefore, batchSize));
    console.log(`StaleContextDocumentPruningTask: deleted ${totalError} stale error documents`);
  }
}

interface StaleContextDocumentPruningTaskEnv extends IEnv {
  DB: D1Database;
  STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS?: string;
  STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS?: string;
}

export { StaleContextDocumentPruningTask };
