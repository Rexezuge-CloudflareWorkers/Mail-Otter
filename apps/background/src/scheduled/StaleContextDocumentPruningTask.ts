import { ApplicationContextDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

const BATCH_SIZE: number = 500;

class StaleContextDocumentPruningTask extends IScheduledTask<StaleContextDocumentPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: StaleContextDocumentPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const deletedGraceDays: number = ConfigurationManager.getStaleContextDocumentDeletedGraceDays(env);
    const errorGraceDays: number = ConfigurationManager.getStaleContextDocumentErrorGraceDays(env);
    const deletedBefore: number = Math.floor(Date.now() / 1000) - deletedGraceDays * 86_400;
    const errorBefore: number = Math.floor(Date.now() / 1000) - errorGraceDays * 86_400;
    const sessionEnv = createD1SessionEnv(env);
    const dao = new ApplicationContextDAO(sessionEnv.DB);

    let totalDeleted: number = 0;
    let deleted: number = BATCH_SIZE;
    while (deleted >= BATCH_SIZE) {
      deleted = await dao.deleteStaleDeletedDocuments(deletedBefore, BATCH_SIZE);
      totalDeleted += deleted;
    }
    console.log(`StaleContextDocumentPruningTask: deleted ${totalDeleted} stale deleted documents`);

    let totalError: number = 0;
    let errorDeleted: number = BATCH_SIZE;
    while (errorDeleted >= BATCH_SIZE) {
      errorDeleted = await dao.deleteStaleErrorDocuments(errorBefore, BATCH_SIZE);
      totalError += errorDeleted;
    }
    console.log(`StaleContextDocumentPruningTask: deleted ${totalError} stale error documents`);
  }
}

interface StaleContextDocumentPruningTaskEnv extends IEnv {
  DB: D1Database;
  STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS?: string;
  STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS?: string;
}

export { StaleContextDocumentPruningTask };
