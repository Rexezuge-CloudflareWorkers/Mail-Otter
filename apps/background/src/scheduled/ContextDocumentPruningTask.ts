import { ApplicationContextDAO } from '@mail-otter/backend-data/dao';
import type { OverLimitApplication } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { ContextService } from '@mail-otter/backend-services/email';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

class ContextDocumentPruningTask extends IScheduledTask<ContextDocumentPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: ContextDocumentPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const globalMax: number = ConfigurationManager.getMaxContextDocumentsPerApplication(env);
    const sessionEnv = createD1SessionEnv(env);
    const contextDAO = new ApplicationContextDAO(sessionEnv.DB);
    const overLimitApps: OverLimitApplication[] = await contextDAO.listApplicationsOverDocumentLimit(globalMax);

    for (const app of overLimitApps) {
      try {
        await new ContextService(sessionEnv).pruneApplicationDocuments(
          app.applicationId,
          app.userEmail,
          app.activeCount,
          app.effectiveLimit,
        );
      } catch (error: unknown) {
        console.error(`Context document pruning failed for application ${app.applicationId}:`, error);
      }
    }
  }
}

interface ContextDocumentPruningTaskEnv extends IEnv {
  DB: D1Database;
  EMAIL_CONTEXT_INDEX: Vectorize;
  MAX_CONTEXT_DOCUMENTS_PER_APPLICATION?: string;
}

export { ContextDocumentPruningTask };
