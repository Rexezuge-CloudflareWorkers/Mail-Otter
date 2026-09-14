import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import type { SecretsStoreSecret } from 'cloudflare:workers';
import { EmailActionDAO } from '@mail-otter/backend-data/dao';
import { setupActionIntegrationTest, createApplicationViaApi, ensureUser } from '../helpers/setup';

const TEST_EMAIL = 'test@example.com';

async function createActionEnv(): Promise<{ applicationId: string; processedMessageId: string }> {
  const applicationId = await createApplicationViaApi('Actions Test App');
  const processedMessageId = `pm-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO processed_messages (processed_message_id, application_id, provider_id, provider_message_id, status, created_at, updated_at) ` +
      `VALUES (?, ?, 'google-gmail', ?, 'summarized', ?, ?)`,
  )
    .bind(processedMessageId, applicationId, `msg-${crypto.randomUUID()}`, now, now)
    .run();
  return { applicationId, processedMessageId };
}

async function actionDAO(): Promise<EmailActionDAO> {
  const secret = (env as Record<string, unknown>)['ACTION_ENCRYPTION_KEY_SECRET'] as SecretsStoreSecret;
  return new EmailActionDAO(env.DB, await secret.get());
}

async function seedTodoAction(): Promise<{ applicationId: string; actionId: string }> {
  const { applicationId, processedMessageId } = await createActionEnv();
  const dao = await actionDAO();
  const actionId = `action-${crypto.randomUUID()}`;
  await dao.create({
    actionId,
    processedMessageId,
    applicationId,
    userEmail: TEST_EMAIL,
    providerId: 'google-gmail',
    providerMessageId: `msg-${crypto.randomUUID()}`,
    actionType: 'manual.todo',
    riskLevel: 'low',
    tokenHash: `hash-${actionId}`,
    payload: { type: 'manual.todo', title: 'Follow up', description: 'Follow up with finance', instructions: 'Send a reminder' },
    expiresAt: Math.floor(Date.now() / 1000) + 86_400,
  });
  return { applicationId, actionId };
}

async function seedCalendarAction(): Promise<{ applicationId: string; actionId: string }> {
  const { applicationId, processedMessageId } = await createActionEnv();
  const dao = await actionDAO();
  const actionId = `action-${crypto.randomUUID()}`;
  await dao.create({
    actionId,
    processedMessageId,
    applicationId,
    userEmail: TEST_EMAIL,
    providerId: 'google-gmail',
    providerMessageId: `msg-${crypto.randomUUID()}`,
    actionType: 'calendar.add_event',
    riskLevel: 'low',
    tokenHash: `hash-${actionId}`,
    payload: {
      type: 'calendar.add_event',
      title: 'Team sync',
      description: 'Weekly sync',
      eventTitle: 'Team sync',
      startTime: new Date(Date.now() + 86_400_000).toISOString(),
      endTime: new Date(Date.now() + 90_000_000).toISOString(),
      timeZone: 'UTC',
    },
    expiresAt: Math.floor(Date.now() / 1000) + 86_400,
  });
  return { applicationId, actionId };
}

/**
 * User action lifecycle on real D1: list, executions audit, snooze,
 * schedule, and execute (`manual.todo` has no provider side effects).
 */
describe('User actions API', () => {
  beforeAll(async () => {
    await setupActionIntegrationTest(env as unknown as Record<string, unknown> & { DB: D1Database }, TEST_EMAIL);
    await ensureUser(env.DB, TEST_EMAIL);
  });

  describe('GET /user/actions', () => {
    it('returns an empty list scoped to a fresh application', async () => {
      const applicationId = await createApplicationViaApi('Actions Empty App');
      const response: Response = await SELF.fetch(`http://localhost/user/actions?applicationId=${applicationId}`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { actions: unknown[] };
      expect(body.actions).toEqual([]);
    });

    it('lists a seeded pending action and filters by status', async () => {
      const { applicationId, actionId } = await seedTodoAction();

      const listed: Response = await SELF.fetch(`http://localhost/user/actions?applicationId=${applicationId}`);
      expect(listed.status).toBe(200);
      const listedBody = (await listed.json()) as { actions: Array<{ actionId: string; status: string }> };
      expect(listedBody.actions.map((action) => action.actionId)).toContain(actionId);

      const filtered: Response = await SELF.fetch(
        `http://localhost/user/actions?applicationId=${applicationId}&status=succeeded`,
      );
      expect(filtered.status).toBe(200);
      const filteredBody = (await filtered.json()) as { actions: Array<{ actionId: string }> };
      expect(filteredBody.actions.map((action) => action.actionId)).not.toContain(actionId);
    });
  });

  describe('GET /user/actions/:actionId/executions', () => {
    it('returns an empty execution list for a pending action', async () => {
      const { actionId } = await seedTodoAction();
      const response: Response = await SELF.fetch(`http://localhost/user/actions/${actionId}/executions`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { executions: unknown[] };
      expect(body.executions).toEqual([]);
    });

    it('returns an empty list for an unknown action', async () => {
      const response: Response = await SELF.fetch(
        'http://localhost/user/actions/00000000-0000-0000-0000-000000000000/executions',
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { executions: unknown[] };
      expect(body.executions).toEqual([]);
    });
  });

  describe('POST /user/actions/:actionId/snooze', () => {
    it('snoozes a pending action and hides it unless showSnoozed is set', async () => {
      const { applicationId, actionId } = await seedTodoAction();
      const snoozedUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

      const snooze: Response = await SELF.fetch(`http://localhost/user/actions/${actionId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozedUntil }),
      });
      expect(snooze.status).toBe(200);
      const snoozeBody = (await snooze.json()) as { action: { snoozedUntil: number | null } };
      expect(snoozeBody.action.snoozedUntil).not.toBeNull();

      const hidden: Response = await SELF.fetch(`http://localhost/user/actions?applicationId=${applicationId}`);
      const hiddenBody = (await hidden.json()) as { actions: Array<{ actionId: string }> };
      expect(hiddenBody.actions.map((action) => action.actionId)).not.toContain(actionId);

      const shown: Response = await SELF.fetch(
        `http://localhost/user/actions?applicationId=${applicationId}&showSnoozed=true`,
      );
      const shownBody = (await shown.json()) as { actions: Array<{ actionId: string }> };
      expect(shownBody.actions.map((action) => action.actionId)).toContain(actionId);
    });

    it('clears the snooze when snoozedUntil is null', async () => {
      const { actionId } = await seedTodoAction();
      const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      await SELF.fetch(`http://localhost/user/actions/${actionId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozedUntil: future }),
      });

      const clear: Response = await SELF.fetch(`http://localhost/user/actions/${actionId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozedUntil: null }),
      });
      expect(clear.status).toBe(200);
      const body = (await clear.json()) as { action: { snoozedUntil: number | null } };
      expect(body.action.snoozedUntil).toBeNull();
    });

    it('returns 400 for a past snooze time and 404 for an unknown action', async () => {
      const { actionId } = await seedTodoAction();
      const past: Response = await SELF.fetch(`http://localhost/user/actions/${actionId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozedUntil: new Date(Date.now() - 3600_000).toISOString() }),
      });
      expect(past.status).toBe(400);

      const missing: Response = await SELF.fetch(
        'http://localhost/user/actions/00000000-0000-0000-0000-000000000000/snooze',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snoozedUntil: new Date(Date.now() + 3600_000).toISOString() }),
        },
      );
      expect(missing.status).toBe(404);
    });
  });

  describe('POST /user/actions/:actionId/schedule', () => {
    it('schedules an auto-executable action for the future', async () => {
      const { actionId } = await seedCalendarAction();
      const scheduledFor = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

      const response: Response = await SELF.fetch(`http://localhost/user/actions/${actionId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledFor }),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { action: { scheduledFor: number | null } };
      expect(body.scheduledFor).not.toBeNull();
    });

    it('returns 400 when scheduling a non-auto-executable action type', async () => {
      const { actionId } = await seedTodoAction();
      const response: Response = await SELF.fetch(`http://localhost/user/actions/${actionId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledFor: new Date(Date.now() + 3600_000).toISOString() }),
      });
      expect(response.status).toBe(400);
    });
  });

  describe('POST /user/actions/:actionId/execute', () => {
    it('executes a manual.todo action and records the execution', async () => {
      const { actionId } = await seedTodoAction();

      const response: Response = await SELF.fetch(`http://localhost/user/actions/${actionId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { action: { actionId: string; status: string } };
      expect(body.action.actionId).toBe(actionId);
      expect(body.action.status).toBe('succeeded');

      const executions: Response = await SELF.fetch(`http://localhost/user/actions/${actionId}/executions`);
      expect(executions.status).toBe(200);
      const executionsBody = (await executions.json()) as { executions: Array<{ status: string }> };
      expect(executionsBody.executions).toHaveLength(1);
      expect(executionsBody.executions[0].status).toBe('succeeded');
    });

    it('returns 404 for an unknown action', async () => {
      const response: Response = await SELF.fetch(
        'http://localhost/user/actions/00000000-0000-0000-0000-000000000000/execute',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      expect(response.status).toBe(404);
    });
  });
});
