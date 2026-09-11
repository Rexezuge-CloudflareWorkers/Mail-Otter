import { computeUnixCutoffSeconds, createD1SessionEnv, pruneInBatches } from '@mail-otter/backend-data/utils';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv, TaskRunSummary } from './IScheduledTask';

interface PruningTaskEnv extends IEnv {
  DB: D1Database;
}

// Template Method for retention-based pruning cron tasks.
// Subclasses supply the retention window (in days) and a single-batch delete step;
// this base computes the unix cutoff, drains via pruneInBatches, and returns a TaskRunSummary.
// pruneBatch receives the task env (some phases, e.g. EmailAction, need secrets from env),
// the session DB, the precomputed cutoff, and the batch size.
abstract class AbstractPruningTask<TEnv extends PruningTaskEnv> extends IScheduledTask<TEnv> {
  protected abstract getRetentionDays(env: TEnv): number;

  protected abstract pruneBatch(env: TEnv, db: D1Queryable, cutoff: number, batchSize: number): Promise<number>;

  protected async handleScheduledTask(_event: ScheduledController, env: TEnv, _ctx: ExecutionContext): Promise<TaskRunSummary> {
    const retentionDays: number = this.getRetentionDays(env);
    const cutoff: number = computeUnixCutoffSeconds(retentionDays);
    const sessionEnv = createD1SessionEnv(env);
    const total: number = await pruneInBatches((batchSize: number) => this.pruneBatch(env, sessionEnv.DB, cutoff, batchSize));
    console.log(`[${this.constructor.name}] deleted ${total} rows`);
    return { itemsProcessed: total, itemsFailed: 0, summary: `Deleted ${total} rows` };
  }
}

export { AbstractPruningTask };
export type { PruningTaskEnv };
