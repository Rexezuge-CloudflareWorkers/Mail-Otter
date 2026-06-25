import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { createActionDAO } from './ActionServiceUtils';
import type { ActionDAOEnv } from './ActionServiceUtils';

interface ActionMaintenanceEnv extends ActionDAOEnv {
  ACTION_RETENTION_DAYS?: string;
}

async function expirePendingActions(env: ActionMaintenanceEnv, limit: number): Promise<number> {
  const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
  const dao = await createActionDAO(env);
  return dao.expirePendingActions(now, limit);
}

async function deleteOldActions(env: ActionMaintenanceEnv, limit: number): Promise<number> {
  const retentionDays: number = ConfigurationManager.getActionRetentionDays(env);
  const olderThan: number = TimestampUtil.subtractDays(TimestampUtil.getCurrentUnixTimestampInSeconds(), retentionDays);
  const dao = await createActionDAO(env);
  return dao.deleteOlderThan(olderThan, limit);
}

export type { ActionMaintenanceEnv };
export { expirePendingActions, deleteOldActions };
