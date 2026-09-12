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

  // Factory Method: override in tests to substitute the run-record DAO.
  protected createTaskRunDAO(db: D1Queryable): BackgroundTaskRunDAO {
    return new BackgroundTaskRunDAO(db);
  }

  public async handle(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const tEnv = env as unknown as TEnv;
    const taskType = this.getTaskType();
    const db: D1Queryable | undefined = 'DB' in tEnv ? (tEnv as unknown as { DB: D1Queryable }).DB : undefined;

    let runId: string | undefined;
    if (taskType && db) {
      const dao = this.createTaskRunDAO(db);
      runId = await dao.startRun({ taskType }).catch((error: unknown) => {
        console.warn(`[${this.constructor.name}] Failed to start task run record:`, error);
        return undefined;
      });
    }

    try {
      const result = await this.handleScheduledTask(event, tEnv, ctx);
      if (runId && db) {
        const dao = this.createTaskRunDAO(db);
        await dao.succeedRun(runId, result ?? { itemsProcessed: 0, itemsFailed: 0 }).catch((error: unknown) => {
          console.warn(`[${this.constructor.name}] Failed to mark task run succeeded:`, error);
        });
      }
    } catch (error: unknown) {
      console.error(`[${this.constructor.name}] Uncaught error:`, error);
      if (runId && db) {
        const dao = this.createTaskRunDAO(db);
        await dao.failRun(runId, String(error)).catch((recordError: unknown) => {
          console.warn(`[${this.constructor.name}] Failed to mark task run failed:`, recordError);
        });
      }
    }
  }

  // Creates a per-application run record and returns a handle to complete it.
  // Call inside per-application loops in tasks that process multiple mailboxes.
  protected async createApplicationRun(taskType: string, applicationId: string, db: D1Queryable): Promise<ApplicationRunHandle> {
    const dao = this.createTaskRunDAO(db);
    const runId = await dao.startRun({ taskType, applicationId });
    const warn = (op: string) => (error: unknown): void => {
      console.warn(`[${this.constructor.name}] Failed to mark application run ${op}:`, error);
    };
    return {
      succeed: (result: TaskRunSummary): Promise<void> => dao.succeedRun(runId, result).catch(warn('succeeded')).then(() => undefined),
      fail: (errorMessage: string, partial?: Partial<TaskRunSummary>): Promise<void> =>
        dao.failRun(runId, errorMessage, partial).catch(warn('failed')).then(() => undefined),
      skip: (reason?: string): Promise<void> => dao.skipRun(runId, reason).catch(warn('skipped')).then(() => undefined),
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
