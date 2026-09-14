import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupActionIntegrationTest, createApplicationViaApi } from '../helpers/setup';

const TEST_EMAIL = 'test@example.com';
const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

async function createIntegration(applicationId: string, name = 'Team webhook'): Promise<string> {
  const response: Response = await SELF.fetch('http://localhost/user/application/integration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      applicationId,
      integrationType: 'webhook',
      name,
      webhookUrl: 'https://hooks.example.com/mail-otter/test',
    }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { integration: { integrationId: string } };
  return body.integration.integrationId;
}

/**
 * Outbound integration CRUD on real D1. The `test` dispatch performs a live
 * outbound fetch, so it is covered for validation/ownership only; delivery
 * listing is covered via the empty-log round-trip.
 */
describe('Application integrations API', () => {
  beforeAll(async () => {
    await setupActionIntegrationTest(env as unknown as Record<string, unknown> & { DB: D1Database }, TEST_EMAIL);
  });

  it('starts with no integrations then creates and lists one', async () => {
    const applicationId = await createApplicationViaApi('Integrations App');

    const empty: Response = await SELF.fetch(
      `http://localhost/user/application/integrations?applicationId=${applicationId}`,
    );
    expect(empty.status).toBe(200);
    const emptyBody = (await empty.json()) as { integrations: unknown[] };
    expect(emptyBody.integrations).toEqual([]);

    const integrationId = await createIntegration(applicationId);

    const listed: Response = await SELF.fetch(
      `http://localhost/user/application/integrations?applicationId=${applicationId}`,
    );
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as {
      integrations: Array<{ integrationId: string; name: string; enabled: boolean }>;
    };
    expect(listedBody.integrations).toHaveLength(1);
    expect(listedBody.integrations[0].integrationId).toBe(integrationId);
    expect(listedBody.integrations[0].enabled).toBe(true);
  });

  it('updates an integration name and disabled flag', async () => {
    const applicationId = await createApplicationViaApi('Integrations Update App');
    const integrationId = await createIntegration(applicationId);

    const response: Response = await SELF.fetch('http://localhost/user/application/integration', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId, name: 'Renamed hook', enabled: false }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { integration: { name: string; enabled: boolean } };
    expect(body.integration.name).toBe('Renamed hook');
    expect(body.integration.enabled).toBe(false);
  });

  it('lists empty delivery logs for a fresh integration', async () => {
    const applicationId = await createApplicationViaApi('Integrations Deliveries App');
    const integrationId = await createIntegration(applicationId);

    const response: Response = await SELF.fetch(
      `http://localhost/user/application/integration/deliveries?integrationId=${integrationId}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { logs: unknown[] };
    expect(body.logs).toEqual([]);
  });

  it('requires integrationId when listing deliveries', async () => {
    const response: Response = await SELF.fetch('http://localhost/user/application/integration/deliveries');
    expect(response.status).toBe(400);
  });

  it('deletes an integration and returns 404 afterwards', async () => {
    const applicationId = await createApplicationViaApi('Integrations Delete App');
    const integrationId = await createIntegration(applicationId);

    const deleted: Response = await SELF.fetch('http://localhost/user/application/integration', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId }),
    });
    expect(deleted.status).toBe(200);

    const reread: Response = await SELF.fetch(
      `http://localhost/user/application/integrations?applicationId=${applicationId}`,
    );
    const rereadBody = (await reread.json()) as { integrations: unknown[] };
    expect(rereadBody.integrations).toEqual([]);

    const deliveries: Response = await SELF.fetch(
      `http://localhost/user/application/integration/deliveries?integrationId=${integrationId}`,
    );
    expect(deliveries.status).toBe(404);
  });

  it('returns 404 for foreign applications and integrations', async () => {
    const list: Response = await SELF.fetch(
      `http://localhost/user/application/integrations?applicationId=${NONEXISTENT_UUID}`,
    );
    expect(list.status).toBe(404);

    const update: Response = await SELF.fetch('http://localhost/user/application/integration', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId: NONEXISTENT_UUID, name: 'X' }),
    });
    expect(update.status).toBe(404);

    const test: Response = await SELF.fetch('http://localhost/user/application/integration/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId: NONEXISTENT_UUID }),
    });
    expect(test.status).toBe(404);
  });
});
