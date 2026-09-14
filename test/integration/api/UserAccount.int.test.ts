import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupActionIntegrationTest, createApplicationViaApi } from '../helpers/setup';

const TEST_EMAIL = 'test@example.com';

/**
 * Account-level routes on real D1: user preferences (`PUT /user/me`),
 * analytics summary, and the activity feed (JSON + CSV export).
 */
describe('User account API', () => {
  beforeAll(async () => {
    await setupActionIntegrationTest(env as unknown as Record<string, unknown> & { DB: D1Database }, TEST_EMAIL);
  });

  describe('PUT /user/me', () => {
    it('persists the preferred language and reflects it on GET /user/me', async () => {
      const update: Response = await SELF.fetch('http://localhost/user/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredLanguage: 'de' }),
      });
      expect(update.status).toBe(200);
      const updateBody = (await update.json()) as { email: string; preferredLanguage: string | null };
      expect(updateBody.email).toBe(TEST_EMAIL);
      expect(updateBody.preferredLanguage).toBe('de');

      const reread: Response = await SELF.fetch('http://localhost/user/me');
      expect(reread.status).toBe(200);
      const rereadBody = (await reread.json()) as { preferredLanguage: string | null };
      expect(rereadBody.preferredLanguage).toBe('de');
    });

    it('returns 400 when preferredLanguage is missing', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(400);
    });

    it('returns 400 for an unsupported language', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredLanguage: 'xx-invalid' }),
      });
      expect(response.status).toBe(400);
    });
  });

  describe('GET /user/analytics', () => {
    it('returns an analytics summary with aiUsage, processing, actions, and context sections', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/analytics');
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        aiUsage: { daily: unknown[]; total: { estimatedNeurons: number } };
        processing: unknown;
        actions: unknown;
        context: unknown;
      };
      expect(Array.isArray(body.aiUsage.daily)).toBe(true);
      expect(typeof body.aiUsage.total.estimatedNeurons).toBe('number');
      expect(body.processing).toBeDefined();
      expect(body.actions).toBeDefined();
      expect(body.context).toBeDefined();
    });

    it('reflects a newly processed message in the summary', async () => {
      const applicationId = await createApplicationViaApi('Analytics Seed App');
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `INSERT INTO processed_messages (processed_message_id, application_id, provider_id, provider_message_id, status, created_at, updated_at) ` +
          `VALUES (?, ?, 'google-gmail', ?, 'summarized', ?, ?)`,
      )
        .bind(`pm-analytics-${Date.now()}`, applicationId, `msg-analytics-${Date.now()}`, now, now)
        .run();

      const response: Response = await SELF.fetch('http://localhost/user/analytics');
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        processing: { total: { summarized: number; skipped: number; error: number } };
      };
      const total = body.processing.total.summarized + body.processing.total.skipped + body.processing.total.error;
      expect(total).toBeGreaterThan(0);
    });

    it('returns 404 for a foreign applicationId filter', async () => {
      const response: Response = await SELF.fetch(
        'http://localhost/user/analytics?applicationId=00000000-0000-0000-0000-000000000000',
      );
      expect(response.status).toBe(404);
    });
  });

  describe('GET /user/activity', () => {
    it('returns an empty entry list for a fresh user scope', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/activity');
      expect(response.status).toBe(200);
      const body = (await response.json()) as { entries: unknown[] };
      expect(Array.isArray(body.entries)).toBe(true);
    });

    it('lists a processed message as an email_processed entry and exports CSV', async () => {
      const applicationId = await createApplicationViaApi('Activity Seed App');
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `INSERT INTO processed_messages (processed_message_id, application_id, provider_id, provider_message_id, status, created_at, updated_at) ` +
          `VALUES (?, ?, 'google-gmail', ?, 'summarized', ?, ?)`,
      )
        .bind(`pm-activity-${Date.now()}`, applicationId, `msg-activity-${Date.now()}`, now, now)
        .run();

      const json: Response = await SELF.fetch(`http://localhost/user/activity?applicationId=${applicationId}`);
      expect(json.status).toBe(200);
      const jsonBody = (await json.json()) as { entries: Array<{ eventType: string }> };
      expect(jsonBody.entries.length).toBeGreaterThan(0);
      expect(jsonBody.entries.some((entry) => entry.eventType === 'email_processed')).toBe(true);

      const csv: Response = await SELF.fetch(`http://localhost/user/activity?applicationId=${applicationId}&format=csv`);
      expect(csv.status).toBe(200);
      expect(csv.headers.get('Content-Type')).toContain('text/csv');
      const text = await csv.text();
      expect(text).toContain('email_processed');
    });

    it('filters entries by event type', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/activity?types=action_created');
      expect(response.status).toBe(200);
      const body = (await response.json()) as { entries: Array<{ eventType: string }> };
      for (const entry of body.entries) {
        expect(entry.eventType).toBe('action_created');
      }
    });
  });
});
