import { AiDailyUsageDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

class AiDailyUsagePruningTask extends IScheduledTask<AiDailyUsagePruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: AiDailyUsagePruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const retentionDays: number = ConfigurationManager.getAiDailyUsageRetentionDays(env);
    const date: Date = new Date(Date.now() - retentionDays * 86_400 * 1000);
    const olderThanDate: string = date.toISOString().split('T', 1)[0];
    const sessionEnv = createD1SessionEnv(env);
    const dao = new AiDailyUsageDAO(sessionEnv.DB);

    const deleted: number = await dao.deleteOlderThanDate(olderThanDate);
    console.log(`AiDailyUsagePruningTask: deleted ${deleted} old usage rows`);
  }
}

interface AiDailyUsagePruningTaskEnv extends IEnv {
  DB: D1Database;
  AI_DAILY_USAGE_RETENTION_DAYS?: string;
}

export { AiDailyUsagePruningTask };
