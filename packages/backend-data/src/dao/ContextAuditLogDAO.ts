import { CursorUtil } from '../utils';
import type { ContextAuditLog, ContextAuditLogInternal, ContextAuditLogList } from '@mail-otter/shared/model';
import type { ContextAuditEventType, ContextAuditLogSeverity } from '@mail-otter/shared/constants';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';

/**
 * D1's hard cap on bound parameters for a single query.
 *
 * Documented at https://developers.cloudflare.com/d1/platform/limits/ as
 * "Maximum bound parameters per query | 100", and measured at exactly 100 in
 * the Workers test pool. Exceeding it fails the statement outright with
 * "too many SQL variables" — it does not truncate.
 */
const D1_MAX_BOUND_PARAMETERS = 100;

/**
Columns bound per `context_audit_logs` row.
*/
const AUDIT_LOG_COLUMN_COUNT = 10;

/**
 * Rows per INSERT statement, derived from the limit rather than guessed.
 *
 * `insertAuditLogs` used to build one statement for the whole input, so any
 * batch larger than ten rows exceeded the parameter cap and threw — a bulk
 * document deletion of 50+ vectors wrote no audit trail at all, because the
 * error propagated out of the caller's `try`.
 */
const AUDIT_LOG_INSERT_CHUNK_SIZE = Math.floor(D1_MAX_BOUND_PARAMETERS / AUDIT_LOG_COLUMN_COUNT);

// Repository for context_audit_logs aggregate.
// Extracted from ApplicationContextDAO (1051 LOC god DAO) — Phase 4 phased split.
class ContextAuditLogDAO extends BaseDAO {
  public async insertAuditLog(input: InsertAuditLogInput): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.withRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO context_audit_logs
                (id, context_document_id, application_id, user_email, source_document_id, event_type, event_label, event_data, severity, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .bind(
            UUIDUtil.getRandomUUID(),
            input.contextDocumentId,
            input.applicationId,
            input.userEmail,
            input.sourceDocumentId || null,
            input.eventType,
            input.eventLabel || null,
            input.eventData ? JSON.stringify(input.eventData) : null,
            input.severity,
            now,
          )
          .run(),
      'insert context audit log',
    );
  }

  /**
   * Insert a batch of audit rows sharing one `created_at`.
   *
   * The shared timestamp is deliberate: a bulk document deletion emits one row
   * per vector, and the audit view groups them. It is also why list pagination
   * needs an `id` tiebreaker — see `listAuditLogs`.
   *
   * Chunked to respect D1's 100-bound-parameter cap; see
   * `AUDIT_LOG_INSERT_CHUNK_SIZE`.
   */
  public async insertAuditLogs(inputs: InsertAuditLogInput[]): Promise<void> {
    if (inputs.length === 0) return;
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    for (let offset = 0; offset < inputs.length; offset += AUDIT_LOG_INSERT_CHUNK_SIZE) {
      const chunk: InsertAuditLogInput[] = inputs.slice(offset, offset + AUDIT_LOG_INSERT_CHUNK_SIZE);
      const placeholders: string = chunk.map((): string => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const bindings: unknown[] = [];
      for (const input of chunk) {
        bindings.push(
          UUIDUtil.getRandomUUID(),
          input.contextDocumentId,
          input.applicationId,
          input.userEmail,
          input.sourceDocumentId || null,
          input.eventType,
          input.eventLabel || null,
          input.eventData ? JSON.stringify(input.eventData) : null,
          input.severity,
          now,
        );
      }
      await this.withRetry(
        (): Promise<D1Result> =>
          this.database
            .prepare(
              `
                INSERT INTO context_audit_logs
                  (id, context_document_id, application_id, user_email, source_document_id, event_type, event_label, event_data, severity, created_at)
                VALUES ${placeholders}
              `,
            )
            .bind(...bindings)
            .run(),
        'batch insert context audit logs',
      );
    }
  }

  public async listAuditLogs(contextDocumentId: string, options: ListAuditLogsOptions = {}): Promise<ContextAuditLogList> {
    const limit: number = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const conditions: string[] = ['context_document_id = ?'];
    const bindings: Array<string | number> = [contextDocumentId];
    const cursor: { createdAt: number; id?: string } | undefined = ContextAuditLogDAO.parseCursor(options.cursor);
    if (cursor) {
      // `insertAuditLogs` binds one `now` for the whole batch, so a bulk delete
      // of 300 vectors writes 300 rows sharing an identical `created_at`.
      // Filtering on `created_at < ?` alone discarded every row after the first
      // page of such a group, so the audit trail silently stopped at 50 entries.
      // `id` breaks the tie.
      if (cursor.id === undefined) {
        conditions.push('created_at < ?');
        bindings.push(cursor.createdAt);
      } else {
        conditions.push('(created_at < ? OR (created_at = ? AND id < ?))');
        bindings.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
    }
    const rows: ContextAuditLogInternal[] = await this.database
      .prepare(
        `
          SELECT id, context_document_id, application_id, user_email, source_document_id, event_type, event_label, event_data, severity, created_at
          FROM context_audit_logs
          WHERE ${conditions.join(' AND ')}
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        `,
      )
      .bind(...bindings, limit + 1)
      .all<ContextAuditLogInternal>()
      .then((result: D1Result<ContextAuditLogInternal>): ContextAuditLogInternal[] => result.results || []);
    const pageRows: ContextAuditLogInternal[] = rows.slice(0, limit);
    return {
      logs: pageRows.map((row: ContextAuditLogInternal): ContextAuditLog => this.toAuditLog(row)),
      nextCursor: rows.length > limit ? ContextAuditLogDAO.encodeCursor(pageRows.at(-1)!.created_at, pageRows.at(-1)!.id) : undefined,
    };
  }

  public async deleteOldAuditLogs(olderThan: number, limit: number): Promise<number> {
    const result: D1Result = await this.withRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              DELETE FROM context_audit_logs
              WHERE id IN (
                SELECT id FROM context_audit_logs
                WHERE created_at < ?
                LIMIT ?
              )
            `,
          )
          .bind(olderThan, limit)
          .run(),
      'delete old context audit logs',
    );
    return (result.meta as { changes?: number })?.changes ?? 0;
  }

  private toAuditLog(row: ContextAuditLogInternal): ContextAuditLog {
    return {
      id: row.id,
      contextDocumentId: row.context_document_id,
      applicationId: row.application_id,
      userEmail: row.user_email,
      sourceDocumentId: row.source_document_id,
      eventType: row.event_type,
      eventLabel: row.event_label,
      eventData: ContextAuditLogDAO.parseEventData(row.event_data),
      severity: row.severity,
      createdAt: row.created_at,
    };
  }

  /**
   * Decode `[createdAt]` (legacy) or `[createdAt, id]` (current).
   *
   * A cursor written before the tiebreaker was added still decodes and falls
   * back to the timestamp filter, so an in-flight client scroll does not break.
   */
  private static parseCursor(cursor: string | undefined): { createdAt: number; id?: string } | undefined {
    const parsed = CursorUtil.decode<unknown[]>(cursor);
    if (!Array.isArray(parsed) || typeof parsed[0] !== 'number') return undefined;
    return typeof parsed[1] === 'string' ? { createdAt: parsed[0], id: parsed[1] } : { createdAt: parsed[0] };
  }

  private static encodeCursor(createdAt: number, id: string): string {
    return CursorUtil.encode([createdAt, id]);
  }

  private static parseEventData(value: string | null): unknown {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}

interface InsertAuditLogInput {
  contextDocumentId: string;
  applicationId: string;
  userEmail: string;
  sourceDocumentId?: string | null;
  eventType: ContextAuditEventType;
  eventLabel?: string | null;
  eventData?: unknown;
  severity: ContextAuditLogSeverity;
}

interface ListAuditLogsOptions {
  cursor?: string;
  limit?: number;
}

export { ContextAuditLogDAO };
export type { InsertAuditLogInput, ListAuditLogsOptions };
