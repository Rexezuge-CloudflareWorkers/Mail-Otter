import { BACKGROUND_TASK_TYPE_SCHEDULED_ACTION_EXECUTION } from '@mail-otter/shared/constants';
import { ActionService } from '@mail-otter/backend-services/action';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv, TaskRunSummary } from './IScheduledTask';

class ScheduledActionExecutionTask extends IScheduledTask<ScheduledActionExecutionTaskEnv> {
  protected getTaskType(): string {
    return BACKGROUND_TASK_TYPE_SCHEDULED_ACTION_EXECUTION;
  }

  protected async handleScheduledTask(
    _event: ScheduledController,
    env: ScheduledActionExecutionTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<TaskRunSummary> {
    const result = await ActionService.executeScheduledActions(env);
    console.log(
      `[ScheduledActionExecutionTask] Executed ${result.attempted} scheduled actions: ${result.succeeded} succeeded, ${result.failed} failed`,
    );
    return {
      itemsProcessed: result.succeeded,
      itemsFailed: result.failed,
      summary: `Executed ${result.attempted} scheduled action(s): ${result.succeeded} succeeded, ${result.failed} failed`,
    };
  }
}

interface ScheduledActionExecutionTaskEnv extends IEnv {
  DB: D1Database;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_SIGNING_SECRET: SecretsStoreSecret;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  PACKAGE_TRACKING_API_KEY?: string;
  FLIGHT_TRACKING_API_KEY?: string;
}

export { ScheduledActionExecutionTask };
