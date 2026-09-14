import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupActionIntegrationTest, createApplicationViaApi } from '../helpers/setup';

const TEST_EMAIL = 'test@example.com';
const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Application context settings + document/deletion visibility on real D1.
 * `POST .../delete-documents` requires the Vectorize binding (absent in the
 * integration harness), so the owned-app path asserts the deterministic
 * `400 Context index is not configured` branch; document reads are D1-only.
 */
describe('Application context API', () => {
  beforeAll(async () => {
    await setupActionIntegrationTest(env as unknown as Record<string, unknown> & { DB: D1Database }, TEST_EMAIL);
  });

  describe('PUT /user/application/context', () => {
    it('persists context settings for an owned application', async () => {
      const applicationId = await createApplicationViaApi('Context Settings App');

      const response: Response = await SELF.fetch('http://localhost/user/application/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, contextIndexingEnabled: true, ragRetrievalEnabled: false }),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { application: { applicationId: string } };
      expect(body.application.applicationId).toBe(applicationId);
    });

    it('returns 400 when maxContextDocuments is not positive', async () => {
      const applicationId = await createApplicationViaApi('Context Limits App');
      const response: Response = await SELF.fetch('http://localhost/user/application/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, maxContextDocuments: 0 }),
      });
      expect(response.status).toBe(400);
    });

    it('returns 404 for a foreign application', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/application/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: NONEXISTENT_UUID, contextIndexingEnabled: true }),
      });
      expect(response.status).toBe(404);
    });
  });

  describe('GET /user/application/context/documents', () => {
    it('returns an empty document list for a fresh application', async () => {
      const applicationId = await createApplicationViaApi('Context Docs App');
      const response: Response = await SELF.fetch(
        `http://localhost/user/application/context/documents?applicationId=${applicationId}`,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { documents: unknown[] };
      expect(body.documents).toEqual([]);
    });
  });

  describe('GET /user/application/context/deletions', () => {
    it('returns an empty deletion-run list for a fresh application', async () => {
      const applicationId = await createApplicationViaApi('Context Deletions App');
      const response: Response = await SELF.fetch(
        `http://localhost/user/application/context/deletions?applicationId=${applicationId}`,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { deletionRuns: unknown[] };
      expect(body.deletionRuns).toEqual([]);
    });
  });

  describe('POST /user/application/context/delete-documents', () => {
    it('returns 400 when the context index binding is not configured', async () => {
      const applicationId = await createApplicationViaApi('Context Delete App');
      const response: Response = await SELF.fetch('http://localhost/user/application/context/delete-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      });
      expect(response.status).toBe(400);
    });

    it('returns 400 for a foreign application while the index binding is missing', async () => {
      const response: Response = await SELF.fetch('http://localhost/user/application/context/delete-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: NONEXISTENT_UUID }),
      });
      // The Vectorize binding check runs before the ownership check, so the
      // harness deterministically returns 400 here; either way the request
      // must not succeed for an unowned mailbox.
      expect([400, 404]).toContain(response.status);
    });
  });

  describe('document provider-link and audit logs', () => {
    it('returns 404 for an unknown context document', async () => {
      const link: Response = await SELF.fetch(
        `http://localhost/user/application/context/document/${NONEXISTENT_UUID}/provider-link`,
      );
      expect(link.status).toBe(404);

      const logs: Response = await SELF.fetch(
        `http://localhost/user/application/context/document/${NONEXISTENT_UUID}/logs`,
      );
      expect(logs.status).toBe(404);
    });
  });
});
