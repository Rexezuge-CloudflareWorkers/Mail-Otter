import { CursorUtil } from '../utils';
import type { ContextAuditLog, ContextAuditLogInternal, ContextAuditLogList } from '@mail-otter/shared/model';
import type { ContextAuditEventType, ContextAuditLogSeverity } from '@mail-otter/shared/constants';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';

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

  public async insertAuditLogs(inputs: InsertAuditLogInput[]): Promise<void> {
    if (inputs.length === 0) return;
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const placeholders: string = inputs.map((): string => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const bindings: unknown[] = [];
    for (const input of inputs) {
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

  public async listAuditLogs(
    contextDocumentId: string,
    options: ListAuditLogsOptions = {},
  ): Promise<ContextAuditLogList> {
    const limit: number = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const conditions: string[] = ['context_document_id = ?'];
    const bindings: Array<string | number> = [contextDocumentId];
    const cursor: { createdAt: number } | undefined = ContextAuditLogDAO.parseCursor(options.cursor);
    if (cursor) {
      conditions.push('created_at < ?');
      bindings.push(cursor.createdAt);
    }
    const rows: ContextAuditLogInternal[] = await this.database
      .prepare(
        `
          SELECT id, context_document_id, application_id, user_email, source_document_id, event_type, event_label, event_data, severity, created_at
          FROM context_audit_logs
          WHERE ${conditions.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT ?
        `,
      )
      .bind(...bindings, limit + 1)
      .all<ContextAuditLogInternal>()
      .then((result: D1Result<ContextAuditLogInternal>): ContextAuditLogInternal[] => result.results || []);
    const pageRows: ContextAuditLogInternal[] = rows.slice(0, limit);
    return {
      logs: pageRows.map((row: ContextAuditLogInternal): ContextAuditLog => this.toAuditLog(row)),
      nextCursor: rows.length > limit ? ContextAuditLogDAO.encodeCursor(pageRows.at(-1)!.created_at) : undefined,
    };
  }

  public async deleteOldAuditLogs(olderThan: number, limit: number): Promise<number> {
    const result: D1Result = await this.withRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              DELETE FROM context_audit_logs
              WHERE created_at < ?
              LIMIT ?
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

  private static parseCursor(cursor: string | undefined): { createdAt: number } | undefined {
    const parsed = CursorUtil.decode<unknown[]>(cursor);
    if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'number') {
      return { createdAt: parsed[0] };
    }
    return undefined;
  }

  private static encodeCursor(createdAt: number): string {
    return CursorUtil.encode([createdAt]);
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
