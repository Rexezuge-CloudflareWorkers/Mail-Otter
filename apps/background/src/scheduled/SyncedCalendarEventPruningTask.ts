import { SyncedCalendarEventDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

const BATCH_SIZE = 500;
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

    let deletedTotal = 0;
    let deleted = BATCH_SIZE;
    while (deleted >= BATCH_SIZE) {
      deleted = await eventDAO.pruneOldEvents(pruneBeforeUnix, BATCH_SIZE);
      deletedTotal += deleted;
    }
    console.log(`[SyncedCalendarEventPruningTask] Pruned ${deletedTotal} old calendar events`);
  }
}

interface SyncedCalendarEventPruningTaskEnv extends IEnv {
  DB: D1Database;
}

export { SyncedCalendarEventPruningTask };
