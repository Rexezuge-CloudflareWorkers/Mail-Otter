import { describe, expect, it, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import type { SecretsStoreSecret } from 'cloudflare:workers';
import { EmailActionDAO } from '@mail-otter/backend-data/dao';
import {
  EMAIL_ACTION_STATUS_SUCCEEDED,
  EMAIL_ACTION_TRIGGER_AUTO_EXECUTE,
  EMAIL_ACTION_TRIGGER_EMAIL_CALLBACK,
  EMAIL_ACTION_TRIGGER_SCHEDULED,
  EMAIL_ACTION_TRIGGER_SYSTEM_EXPIRY,
  EMAIL_ACTION_TRIGGER_WEB_UI,
} from '@mail-otter/shared/constants';
import { setupActionIntegrationTest, createApplicationViaApi } from '../helpers/setup';

const TEST_EMAIL = 'test@example.com';

/**
 * `email_action_executions.triggered_by` CHECK constraint on real D1.
 *
 * Regression guard for a production-breaking mismatch. `0021_squash.sql`
 * created the column with a CHECK listing only four triggers, but
 * `0025_action_scheduling.sql` shipped the scheduling feature without
 * widening it. Every cron-driven `executeScheduledActions` therefore threw a
 * CHECK violation *after* the provider side effect had already succeeded, and
 * `executeAction` caught it and called `markFailed` — so a scheduled
 * `calendar.add_event` created a real Google event while the UI reported
 * `failed` and no execution row was ever stored.
 *
 * Nothing caught it because the unit tests stub `EmailActionDAO` and the DAO
 * tests inserted `triggered_by: 'user'`, a value that is not in the CHECK list
 * either, against a mock D1 that enforces no constraints. Only a real D1
 * round-trip exercises the constraint at all.
 */
describe('email_action_executions triggered_by constraint', () => {
  let applicationId: string;

  const dao = async (): Promise<EmailActionDAO> => {
    const secret = (env as Record<string, unknown>)['ACTION_ENCRYPTION_KEY_SECRET'] as SecretsStoreSecret;
    return new EmailActionDAO(env.DB, await secret.get());
  };

  const createAction = async (): Promise<string> => {
    const actionDAO = await dao();
    const processedMessageId = `pm-${crypto.randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO processed_messages (processed_message_id, application_id, provider_id, provider_message_id, status, created_at, updated_at) ` +
        `VALUES (?, ?, 'google-gmail', ?, 'summarized', ?, ?)`,
    )
      .bind(processedMessageId, applicationId, `msg-${crypto.randomUUID()}`, now, now)
      .run();
    const actionId = `action-${crypto.randomUUID()}`;
    await actionDAO.create({
      actionId,
      processedMessageId,
      applicationId,
      userEmail: TEST_EMAIL,
      providerId: 'google-gmail',
      providerMessageId: `msg-${crypto.randomUUID()}`,
      actionType: 'calendar.add_event',
      riskLevel: 'low',
      tokenHash: `hash-${actionId}`,
      payload: { type: 'calendar.add_event', title: 'Standup', start: '2026-01-01T09:00:00Z' },
      expiresAt: now + 86_400,
    });
    return actionId;
  };

  beforeAll(async () => {
    await setupActionIntegrationTest(env, TEST_EMAIL);
    applicationId = await createApplicationViaApi('Trigger Check App');
  });

  it("accepts the 'scheduled' trigger that the scheduling feature writes", async () => {
    const actionDAO = await dao();
    const actionId = await createAction();

    const execution = await actionDAO.recordExecution({
      actionId,
      triggeredBy: EMAIL_ACTION_TRIGGER_SCHEDULED,
      status: EMAIL_ACTION_STATUS_SUCCEEDED,
    });

    expect(execution.triggeredBy).toBe(EMAIL_ACTION_TRIGGER_SCHEDULED);

    const { executions } = await actionDAO.listExecutions(actionId);
    expect(executions).toHaveLength(1);
    expect(executions[0].triggeredBy).toBe(EMAIL_ACTION_TRIGGER_SCHEDULED);
  });

  it('still accepts the four pre-existing triggers', async () => {
    const actionDAO = await dao();
    const preExisting = [
      EMAIL_ACTION_TRIGGER_EMAIL_CALLBACK,
      EMAIL_ACTION_TRIGGER_WEB_UI,
      EMAIL_ACTION_TRIGGER_SYSTEM_EXPIRY,
      EMAIL_ACTION_TRIGGER_AUTO_EXECUTE,
    ];

    for (const triggeredBy of preExisting) {
      const actionId = await createAction();
      const execution = await actionDAO.recordExecution({
        actionId,
        triggeredBy,
        status: EMAIL_ACTION_STATUS_SUCCEEDED,
      });
      expect(execution.triggeredBy).toBe(triggeredBy);
    }
  });

  it('still rejects a value outside the trigger set', async () => {
    const actionDAO = await dao();
    const actionId = await createAction();

    await expect(
      actionDAO.recordExecution({
        actionId,
        triggeredBy: 'not_a_real_trigger' as never,
        status: EMAIL_ACTION_STATUS_SUCCEEDED,
      }),
    ).rejects.toThrow();
  });

  it('preserves the foreign key and index across the table rebuild', async () => {
    // The rebuild in 0027 dropped and recreated the table, so assert the
    // cascade FK and the covering index both survived.
    const foreignKeys = await env.DB.prepare(`PRAGMA foreign_key_list('email_action_executions')`).all<{
      table: string;
    }>();
    expect(foreignKeys.results?.map((row: { table: string }) => row.table)).toContain('email_summary_actions');

    const indexes = await env.DB.prepare(`PRAGMA index_list('email_action_executions')`).all<{ name: string }>();
    expect(indexes.results?.map((row: { name: string }) => row.name)).toContain('idx_email_action_executions_action');
  });

  it('cascades deletes from email_summary_actions', async () => {
    const actionDAO = await dao();
    const actionId = await createAction();
    await actionDAO.recordExecution({
      actionId,
      triggeredBy: EMAIL_ACTION_TRIGGER_SCHEDULED,
      status: EMAIL_ACTION_STATUS_SUCCEEDED,
    });

    await env.DB.prepare('DELETE FROM email_summary_actions WHERE action_id = ?').bind(actionId).run();

    const remaining = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM email_action_executions WHERE action_id = ?')
      .bind(actionId)
      .first<{ cnt: number }>();
    expect(remaining?.cnt).toBe(0);
  });
});
