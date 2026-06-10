import { OAuth2AuthorizationSessionDAO } from '@mail-otter/backend-data/dao';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

const BATCH_SIZE: number = 500;

class OAuth2SessionPruningTask extends IScheduledTask<OAuth2SessionPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: OAuth2SessionPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const dao = new OAuth2AuthorizationSessionDAO(env.DB);

    let total: number = 0;
    let deleted: number = BATCH_SIZE;
    while (deleted >= BATCH_SIZE) {
      deleted = await dao.deleteExpiredSessions(BATCH_SIZE);
      total += deleted;
    }
    console.log(`OAuth2SessionPruningTask: deleted ${total} expired sessions`);
  }
}

interface OAuth2SessionPruningTaskEnv extends IEnv {
  DB: D1Database;
}

export { OAuth2SessionPruningTask };
