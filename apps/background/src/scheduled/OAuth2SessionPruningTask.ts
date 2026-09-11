import { OAuth2AuthorizationSessionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { AbstractPruningTask } from './AbstractPruningTask';
import type { IEnv } from './IScheduledTask';

class OAuth2SessionPruningTask extends AbstractPruningTask<OAuth2SessionPruningTaskEnv> {
  // OAuth2 sessions expire by their own expires_at/consumed_at markers rather than a
  // retention window, so there is no retention-days env key. The cutoff is unused.
  protected getRetentionDays(_env: OAuth2SessionPruningTaskEnv): number {
    return 0;
  }

  protected pruneBatch(_env: OAuth2SessionPruningTaskEnv, db: D1Queryable, _cutoff: number, batchSize: number): Promise<number> {
    return new OAuth2AuthorizationSessionDAO(db).deleteExpiredSessions(batchSize);
  }
}

interface OAuth2SessionPruningTaskEnv extends IEnv {
  DB: D1Database;
}

export { OAuth2SessionPruningTask };
