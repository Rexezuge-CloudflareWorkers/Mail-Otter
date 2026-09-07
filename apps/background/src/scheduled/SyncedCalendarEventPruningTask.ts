import { SyncedCalendarEventDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv, pruneInBatches } from '@mail-otter/backend-data/utils';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

const PRUNE_BEFORE_DAYS = 1;

class SyncedCalendarEventPruningTask extends IScheduledTask<SyncedCalendarEventPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: SyncedCalendarEventPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const sessionEnv = createD1SessionEnv(env);
    const eventDAO = new SyncedCalendarEventDAO(sessionEnv.DB);
    const pruneBeforeUnix = TimestampUtil.getCurrentUnixTimestampInSeconds() - PRUNE_BEFORE_DAYS * 86_400;

    const deletedTotal = await pruneInBatches((batchSize) => eventDAO.pruneOldEvents(pruneBeforeUnix, batchSize));
    console.log(`[SyncedCalendarEventPruningTask] Pruned ${deletedTotal} old calendar events`);
  }
}

interface SyncedCalendarEventPruningTaskEnv extends IEnv {
  DB: D1Database;
}

export { SyncedCalendarEventPruningTask };
