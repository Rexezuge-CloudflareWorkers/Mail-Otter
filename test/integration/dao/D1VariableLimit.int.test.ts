import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { ContextAuditLogDAO } from '@mail-otter/backend-data/dao';
import type { InsertAuditLogInput } from '@mail-otter/backend-data/dao';
import { setupActionIntegrationTest, createApplicationViaApi } from '../helpers/setup';

const TEST_EMAIL = 'test@example.com';

/**
 * D1 caps bound parameters per query at 100
 * (https://developers.cloudflare.com/d1/platform/limits/).
 *
 * `ContextAuditLogDAO.insertAuditLogs` used to emit a single statement for the
 * whole input with 10 bindings per row, so any batch over ten rows exceeded the
 * cap and threw "too many SQL variables". A bulk document deletion writes one
 * row per vector, so deleting 50+ vectors produced no audit trail at all.
 */
describe('D1 bound parameter limit', () => {
  const probe = async (variables: number): Promise<boolean> => {
    const placeholders = Array.from({ length: variables }, (): string => '?').join(', ');
    try {
      await env.DB.prepare(`SELECT ${placeholders}`)
        .bind(...Array.from({ length: variables }, (): number => 1))
        .all();
      return true;
    } catch {
      return false;
    }
  };

  it('matches the documented limit of 100 bound parameters', async () => {
    // If a future runtime raises this, the DAO's chunk size can be raised too.
    expect(await probe(100)).toBe(true);
    expect(await probe(101)).toBe(false);
  });

  describe('ContextAuditLogDAO.insertAuditLogs', () => {
    let applicationId: string;
    let dao: ContextAuditLogDAO;

    const seedDocument = async (): Promise<string> => {
      const contextDocumentId = `doc-${crypto.randomUUID()}`;
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `INSERT INTO application_context_documents
           (context_document_id, application_id, user_email, source_type, source_provider_id, source_document_id,
            vector_namespace, vector_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'email', 'google-gmail', ?, ?, ?, 'active', ?, ?)`,
      )
        .bind(
          contextDocumentId,
          applicationId,
          TEST_EMAIL,
          `msg-${crypto.randomUUID()}`,
          `ns-${crypto.randomUUID()}`,
          `vec-${crypto.randomUUID()}`,
          now,
          now,
        )
        .run();
      return contextDocumentId;
    };

    const auditInputs = (contextDocumentId: string, count: number): InsertAuditLogInput[] =>
      Array.from({ length: count }, (_unused, index: number) => ({
        contextDocumentId,
        applicationId,
        userEmail: TEST_EMAIL,
        eventType: 'context.document_deleted' as const,
        severity: 'info' as const,
        eventLabel: `deleted ${index}`,
      }));

    beforeAll(async () => {
      await setupActionIntegrationTest(env, TEST_EMAIL);
      applicationId = await createApplicationViaApi('Audit Chunking App');
      dao = new ContextAuditLogDAO(env.DB);
    });

    it('inserts a batch well past the single-statement limit', async () => {
      const contextDocumentId = await seedDocument();
      // 250 rows would be 2,500 bindings unbatched.
      await dao.insertAuditLogs(auditInputs(contextDocumentId, 250));

      const count = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM context_audit_logs WHERE context_document_id = ?')
        .bind(contextDocumentId)
        .first<{ cnt: number }>();
      expect(count?.cnt).toBe(250);
    });

    it('keeps one created_at across the whole chunked batch', async () => {
      const contextDocumentId = await seedDocument();
      await dao.insertAuditLogs(auditInputs(contextDocumentId, 30));

      const rows = await env.DB.prepare('SELECT DISTINCT created_at AS ts FROM context_audit_logs WHERE context_document_id = ?')
        .bind(contextDocumentId)
        .all<{ ts: number }>();
      // The audit view groups a bulk deletion by timestamp, so chunking must
      // not split the group.
      expect(rows.results).toHaveLength(1);
    });

    it('still accepts an empty batch', async () => {
      await expect(dao.insertAuditLogs([])).resolves.toBeUndefined();
    });
  });
});
