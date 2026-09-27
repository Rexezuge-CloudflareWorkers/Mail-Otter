import { describe, expect, it, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { ActivityDAO, ContextAuditLogDAO } from '@mail-otter/backend-data/dao';
import { setupActionIntegrationTest, createApplicationViaApi, seedConnectedApp } from '../helpers/setup';

const TEST_EMAIL = 'test@example.com';

/**
 * Cursor pagination across tied timestamps.
 *
 * `created_at` is unix *seconds*. Three places paginated on `created_at < ?`
 * with no tiebreaker, so every row sharing the boundary second with the last
 * row of a page was filtered out of the next page and never appeared.
 *
 * The audit-log case is not merely possible but guaranteed: `insertAuditLogs`
 * binds a single `now` for the whole batch, so deleting N vectors writes N rows
 * with an identical `created_at`. With the default page size of 50, a 300-row
 * bulk delete showed the user only the first 50 audit entries.
 */
describe('tied-timestamp cursor pagination', () => {
  beforeAll(async () => {
    await setupActionIntegrationTest(env, TEST_EMAIL);
  });

  it('returns every audit log from a single-timestamp batch', async () => {
    const applicationId = await createApplicationViaApi('Audit Tie App');
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

    const dao = new ContextAuditLogDAO(env.DB);
    // 120 rows, all sharing one created_at: exactly the shape a bulk delete
    // produces.
    await dao.insertAuditLogs(
      Array.from({ length: 120 }, (_unused, index: number) => ({
        contextDocumentId,
        applicationId,
        userEmail: TEST_EMAIL,
        eventType: 'context.document_deleted',
        severity: 'info' as const,
        eventLabel: `deleted ${index}`,
      })),
    );

    const total = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM context_audit_logs WHERE context_document_id = ?')
      .bind(contextDocumentId)
      .first<{ cnt: number }>();
    expect(total?.cnt).toBe(120);

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await dao.listAuditLogs(contextDocumentId, { limit: 50, cursor });
      seen.push(...page.logs.map((log) => log.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 20);

    expect(pages).toBeGreaterThan(1);
    expect(seen).toHaveLength(120);
    // No duplicates and no gaps: pagination is a clean partition.
    expect(new Set(seen).size).toBe(120);
  });

  it('still resumes from a legacy timestamp-only cursor', async () => {
    const applicationId = await createApplicationViaApi('Audit Legacy Cursor App');
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

    const dao = new ContextAuditLogDAO(env.DB);
    await dao.insertAuditLogs(
      Array.from({ length: 3 }, (_unused, index: number) => ({
        contextDocumentId,
        applicationId,
        userEmail: TEST_EMAIL,
        eventType: 'context.document_deleted',
        severity: 'info' as const,
        eventLabel: `legacy ${index}`,
      })),
    );

    // A cursor written by the previous `[createdAt]`-only shape.
    const { CursorUtil } = await import('@mail-otter/backend-data/utils');
    const legacyCursor = CursorUtil.encode([now + 1]);
    const page = await dao.listAuditLogs(contextDocumentId, { limit: 50, cursor: legacyCursor });
    expect(page.logs).toHaveLength(3);
  });

  it('pages the activity feed without dropping same-second messages', async () => {
    const applicationId = await seedConnectedApp(env.DB, TEST_EMAIL);
    const now = Math.floor(Date.now() / 1000);
    // 30 messages in one second, paged 10 at a time.
    const ids = Array.from({ length: 30 }, () => `tie-${crypto.randomUUID()}`);
    for (const providerMessageId of ids) {
      await env.DB.prepare(
        `INSERT INTO processed_messages (processed_message_id, application_id, provider_id, provider_message_id, status, created_at, updated_at)
         VALUES (?, ?, 'google-gmail', ?, 'summarized', ?, ?)`,
      )
        .bind(crypto.randomUUID(), applicationId, providerMessageId, now, now)
        .run();
    }

    const dao = new ActivityDAO(env.DB);
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await dao.listForUser(TEST_EMAIL, { applicationId, limit: 10, cursor });
      for (const entry of page.entries) {
        if (entry.eventType === 'email_processed') seen.add(entry.providerMessageId);
      }
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 20);

    expect(pages).toBeGreaterThan(1);
    for (const providerMessageId of ids) {
      expect(seen, `missing ${providerMessageId} after paging`).toContain(providerMessageId);
    }
  });

  it('still resumes the activity feed from a legacy cursor', async () => {
    const applicationId = await seedConnectedApp(env.DB, TEST_EMAIL);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO processed_messages (processed_message_id, application_id, provider_id, provider_message_id, status, created_at, updated_at)
       VALUES (?, ?, 'google-gmail', ?, 'summarized', ?, ?)`,
    )
      .bind(crypto.randomUUID(), applicationId, `legacy-${crypto.randomUUID()}`, now, now)
      .run();

    const { CursorUtil } = await import('@mail-otter/backend-data/utils');
    const dao = new ActivityDAO(env.DB);
    const page = await dao.listForUser(TEST_EMAIL, {
      applicationId,
      limit: 10,
      cursor: CursorUtil.encode({ beforeTs: now + 1 }),
    });
    expect(page.entries.length).toBeGreaterThan(0);
  });
});
