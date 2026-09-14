import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import {
  AiDailyUsageDAO,
  BackgroundTaskRunDAO,
  IntegrationDeliveryLogDAO,
  ProcessedMessageDAO,
  SyncedCalendarEventDAO,
} from '@mail-otter/backend-data/dao';
import { setupActionIntegrationTest, createApplicationViaApi } from '../helpers/setup';

const TEST_EMAIL = 'test@example.com';

/**
 * Retention pruning + processing visibility on real D1.
 *
 * The pruning cron tasks delegate to these DAO delete methods
 * (`AbstractPruningTask.pruneBatch`), so exercising the deletes plus the
 * `GET /user/processing/*` visibility round-trips guards the whole
 * retention path without requiring DO/Workflow bindings.
 */
describe('Pruning and processing visibility', () => {
  beforeAll(async () => {
    await setupActionIntegrationTest(env as unknown as Record<string, unknown> & { DB: D1Database }, TEST_EMAIL);
  });

  it('prunes old summarized messages while keeping fresh ones', async () => {
    const applicationId = await createApplicationViaApi('Prune Messages App');
    const dao = new ProcessedMessageDAO(env.DB);
    const now = Math.floor(Date.now() / 1000);

    const oldMessageId = `old-prune-${Date.now()}`;
    await dao.tryStart(applicationId, 'google-gmail', oldMessageId, 'thread-1');
    await dao.markSummarized(applicationId, oldMessageId);
    await env.DB.prepare(
      `UPDATE processed_messages SET updated_at = ? WHERE application_id = ? AND provider_message_id = ?`,
    )
      .bind(now - 100 * 86_400, applicationId, oldMessageId)
      .run();

    const freshMessageId = `fresh-keep-${Date.now()}`;
    await dao.tryStart(applicationId, 'google-gmail', freshMessageId, 'thread-1');

    const deleted = await dao.deleteOlderThan(now - 90 * 86_400, ['summarized'], 10);
    expect(deleted).toBeGreaterThanOrEqual(1);

    const remaining = await dao.listForUser(TEST_EMAIL, { applicationId });
    expect(remaining.messages.length).toBeGreaterThan(0);
    expect(remaining.messages.every((message) => message.providerMessageId.startsWith('fresh-keep-'))).toBe(true);
  });

  it('prunes old AI usage rows while keeping the current period', async () => {
    const dao = new AiDailyUsageDAO(env.DB);
    await dao.incrementUsage({ usageDate: '2024-01-01', estimatedNeurons: 10 });
    await dao.incrementUsage({ usageDate: '2026-09-01', estimatedNeurons: 25 });

    const deleted = await dao.deleteOlderThanDate('2025-01-01');
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await dao.getByDate('2024-01-01')).toBeUndefined();
    expect(await dao.getByDate('2026-09-01')).toBeDefined();
  });

  it('records background task runs and exposes them via the visibility API', async () => {
    const applicationId = await createApplicationViaApi('Task Runs App');
    const dao = new BackgroundTaskRunDAO(env.DB);

    const runId = await dao.startRun({ taskType: 'email-processing', applicationId });
    await dao.succeedRun(runId, { itemsProcessed: 3, itemsFailed: 0, summary: 'ok' });

    const listed = await dao.listForUser(TEST_EMAIL, { applicationId });
    expect(listed.runs.map((run) => run.runId)).toContain(runId);

    const response: Response = await SELF.fetch(
      `http://localhost/user/processing/task-runs?applicationId=${applicationId}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { runs: Array<{ runId: string; status: string }> };
    expect(body.runs.map((run) => run.runId)).toContain(runId);
  });

  it('prunes old background task runs while keeping recent ones', async () => {
    const applicationId = await createApplicationViaApi('Prune Runs App');
    const dao = new BackgroundTaskRunDAO(env.DB);
    const now = Math.floor(Date.now() / 1000);

    const oldRunId = await dao.startRun({ taskType: 'prune-probe', applicationId });
    await dao.succeedRun(oldRunId, { itemsProcessed: 1, itemsFailed: 0 });
    await env.DB.prepare(`UPDATE background_task_runs SET started_at = ? WHERE run_id = ?`)
      .bind(now - 60 * 86_400, oldRunId)
      .run();

    const freshRunId = await dao.startRun({ taskType: 'prune-probe', applicationId });
    await dao.succeedRun(freshRunId, { itemsProcessed: 1, itemsFailed: 0 });

    const deleted = await dao.pruneOldRuns(now - 30 * 86_400, 10);
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await dao.getById(oldRunId)).toBeUndefined();
    expect(await dao.getById(freshRunId)).toBeDefined();
  });

  it('upserts calendar events, exposes them via the API, and prunes ended events', async () => {
    const applicationId = await createApplicationViaApi('Calendar Visibility App');
    const dao = new SyncedCalendarEventDAO(env.DB);
    const now = Math.floor(Date.now() / 1000);

    await dao.upsertEvents(applicationId, [
      {
        providerEventId: `upcoming-${Date.now()}`,
        eventTitle: 'Upcoming sync',
        startTime: now + 3600,
        endTime: now + 7200,
        timeZone: 'UTC',
      },
      {
        providerEventId: `ended-${Date.now()}`,
        eventTitle: 'Old sync',
        startTime: now - 100 * 86_400,
        endTime: now - 99 * 86_400,
        timeZone: 'UTC',
      },
    ]);

    const visible: Response = await SELF.fetch(
      `http://localhost/user/processing/calendar-events?applicationId=${applicationId}`,
    );
    expect(visible.status).toBe(200);
    const visibleBody = (await visible.json()) as { events: Array<{ eventTitle: string }> };
    expect(visibleBody.events.length).toBe(2);

    const deleted = await dao.pruneOldEvents(now - 90 * 86_400, 10);
    expect(deleted).toBe(1);

    const remaining = await dao.listForUser(TEST_EMAIL, { applicationId });
    expect(remaining.events).toHaveLength(1);
    expect(remaining.events[0].eventTitle).toBe('Upcoming sync');
  });

  it('lists processed messages via the visibility API', async () => {
    const applicationId = await createApplicationViaApi('Messages Visibility App');
    const dao = new ProcessedMessageDAO(env.DB);
    await dao.tryStart(applicationId, 'google-gmail', `visible-${Date.now()}`, 'thread-1');

    const response: Response = await SELF.fetch(
      `http://localhost/user/processing/messages?applicationId=${applicationId}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { messages: Array<{ providerMessageId: string }> };
    expect(body.messages.length).toBeGreaterThan(0);
  });

  it('prunes old integration delivery logs while keeping recent ones', async () => {
    const applicationId = await createApplicationViaApi('Prune Deliveries App');
    const create: Response = await SELF.fetch('http://localhost/user/application/integration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId,
        integrationType: 'webhook',
        name: 'Prune probe',
        webhookUrl: 'https://hooks.example.com/mail-otter/prune',
      }),
    });
    expect(create.status).toBe(200);
    const created = (await create.json()) as { integration: { integrationId: string } };
    const integrationId = created.integration.integrationId;

    const dao = new IntegrationDeliveryLogDAO(env.DB);
    const now = Math.floor(Date.now() / 1000);
    const oldLog = await dao.create({
      integrationId,
      applicationId,
      status: 'success',
      httpStatus: 200,
      errorMessage: null,
      emailSubject: 'Old',
    });
    await env.DB.prepare(`UPDATE integration_delivery_logs SET created_at = ? WHERE log_id = ?`)
      .bind(now - 60 * 86_400, oldLog.logId)
      .run();
    const freshLog = await dao.create({
      integrationId,
      applicationId,
      status: 'success',
      httpStatus: 200,
      errorMessage: null,
      emailSubject: 'Fresh',
    });

    const deleted = await dao.deleteOlderThan(now - 30 * 86_400, 10);
    expect(deleted).toBe(1);
    const remaining = await dao.listByIntegrationId(integrationId, 10);
    expect(remaining.map((log) => log.logId)).toEqual([freshLog.logId]);
  });
});
