import { BackgroundTaskRunDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';

interface TaskRunSummary {
  itemsProcessed: number;
  itemsFailed: number;
  summary?: string;
  details?: unknown;
}

// Handle returned by createApplicationRun() — Builder pattern.
// Lets per-application tasks track sub-runs cleanly without coupling to the DAO directly.
interface ApplicationRunHandle {
  succeed(result: TaskRunSummary): Promise<void>;
  fail(errorMessage: string, partial?: Partial<TaskRunSummary>): Promise<void>;
  skip(reason?: string): Promise<void>;
}

abstract class IScheduledTask<TEnv extends IEnv> {
  // Override to opt into automatic global run tracking via the Template Method.
  // Per-application tasks should NOT override this — use createApplicationRun() instead
  // to avoid creating a redundant global record alongside per-app records.
  protected getTaskType(): string | null {
    return null;
  }

  public async handle(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const tEnv = env as unknown as TEnv;
    const taskType = this.getTaskType();
    const db: D1Queryable | undefined = 'DB' in tEnv ? (tEnv as unknown as { DB: D1Queryable }).DB : undefined;

    let runId: string | undefined;
    if (taskType && db) {
      const dao = new BackgroundTaskRunDAO(db);
      runId = await dao.startRun({ taskType }).catch(() => undefined);
    }

    try {
      const result = await this.handleScheduledTask(event, tEnv, ctx);
      if (runId && db) {
        const dao = new BackgroundTaskRunDAO(db);
        await dao.succeedRun(runId, result ?? { itemsProcessed: 0, itemsFailed: 0 }).catch(() => {});
      }
    } catch (error: unknown) {
      console.error(`[${this.constructor.name}] Uncaught error:`, error);
      if (runId && db) {
        const dao = new BackgroundTaskRunDAO(db);
        await dao.failRun(runId, String(error)).catch(() => {});
      }
    }
  }

  // Creates a per-application run record and returns a handle to complete it.
  // Call inside per-application loops in tasks that process multiple mailboxes.
  protected async createApplicationRun(taskType: string, applicationId: string, db: D1Queryable): Promise<ApplicationRunHandle> {
    const dao = new BackgroundTaskRunDAO(db);
    const runId = await dao.startRun({ taskType, applicationId });
    return {
      succeed: (result: TaskRunSummary): Promise<void> => dao.succeedRun(runId, result).catch(() => {}),
      fail: (errorMessage: string, partial?: Partial<TaskRunSummary>): Promise<void> =>
        dao.failRun(runId, errorMessage, partial).catch(() => {}),
      skip: (reason?: string): Promise<void> => dao.skipRun(runId, reason).catch(() => {}),
    };
  }

  // Return type is widened to TaskRunSummary | void for backward compatibility.
  // Existing tasks returning void satisfy this signature without changes.
  // New observable tasks return TaskRunSummary for richer run records.
  protected abstract handleScheduledTask(
    event: ScheduledController,
    env: TEnv,
    ctx: ExecutionContext,
  ): Promise<TaskRunSummary | void>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface IEnv {}

export { IScheduledTask };
export type { IEnv, TaskRunSummary, ApplicationRunHandle };
