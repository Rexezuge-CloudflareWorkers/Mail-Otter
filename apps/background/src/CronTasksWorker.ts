import { AbstractDurableObjectWorker } from '@mail-otter/backend-runtime/base';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import {
  AiDailyUsagePruningTask,
  AuditLogPruningTask,
  ContextDeletionRunPruningTask,
  ContextDocumentPruningTask,
  EmailActionPruningTask,
  OAuth2AccessTokenRefreshTask,
  OAuth2SessionPruningTask,
  ProcessedMessagePruningTask,
  StaleContextDocumentPruningTask,
} from '@mail-otter/background/scheduled';
import { SubscriptionRenewalUtil } from '@mail-otter/backend-services/subscription';

const CRON_TASKS_RUN_PATH: string = '/run';

interface CronTasksRunRequest {
  cron?: unknown;
  scheduledTime?: unknown;
}

class CronTasksWorker extends AbstractDurableObjectWorker {
  protected currentRun: Promise<void> | undefined;

  protected async onRequest(request: Request): Promise<Response> {
    const url: URL = new URL(request.url);
    if (url.pathname !== CRON_TASKS_RUN_PATH) {
      return Response.json({ error: 'Not Found' }, { status: 404 });
    }
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: { Allow: 'POST' } });
    }
    if (this.currentRun) {
      return Response.json({ status: 'already_running' }, { status: 202 });
    }

    const run: Promise<void> = this.runScheduledTaskRequest(request);
    this.currentRun = run;

    try {
      await run;
      return Response.json({ status: 'completed' });
    } catch (error: unknown) {
      console.error('Cron task run failed:', error);
      return Response.json({ status: 'failed' }, { status: 500 });
    } finally {
      if (this.currentRun === run) {
        this.currentRun = undefined;
      }
    }
  }

  protected async runScheduledTaskRequest(request: Request): Promise<void> {
    const event: ScheduledController = await this.createScheduledController(request);
    await this.runScheduledTasks(event);
  }

  protected async createScheduledController(request: Request): Promise<ScheduledController> {
    const payload: CronTasksRunRequest = await this.readRunRequest(request);
    return {
      cron: typeof payload.cron === 'string' ? payload.cron : '',
      scheduledTime: typeof payload.scheduledTime === 'number' ? payload.scheduledTime : Date.now(),
      noRetry: (): void => undefined,
    };
  }

  protected async readRunRequest(request: Request): Promise<CronTasksRunRequest> {
    try {
      return (await request.json()) as CronTasksRunRequest;
    } catch {
      return {};
    }
  }

  protected async runScheduledTasks(event: ScheduledController): Promise<void> {
    const ctx: ExecutionContext = this.createExecutionContext();
    await Promise.all([
      new OAuth2AccessTokenRefreshTask().handle(event, this.env, ctx),
      new ContextDocumentPruningTask().handle(event, this.env, ctx),
      SubscriptionRenewalUtil.renewDueSubscriptions(createD1SessionEnv(this.env)),
    ]);
    await Promise.all([
      new ProcessedMessagePruningTask().handle(event, this.env, ctx),
      new StaleContextDocumentPruningTask().handle(event, this.env, ctx),
      new OAuth2SessionPruningTask().handle(event, this.env, ctx),
      new ContextDeletionRunPruningTask().handle(event, this.env, ctx),
      new AiDailyUsagePruningTask().handle(event, this.env, ctx),
      new EmailActionPruningTask().handle(event, this.env, ctx),
      new AuditLogPruningTask().handle(event, this.env, ctx),
    ]);
  }
}

export { CronTasksWorker };
