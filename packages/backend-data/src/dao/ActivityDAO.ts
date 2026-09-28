import { CursorUtil } from '../utils';
import type {
  ActivityEntry,
  ActivityEntryList,
  ActivityEventType,
  ActionCreatedEntry,
  ActionExecutedEntry,
  EmailProcessedEntry,
} from '@mail-otter/shared/model';
import { userScopeSql } from './userScope';
import type { UserScope, UserScopeSql } from './userScope';
import { BaseDAO } from './BaseDAO';

interface ListActivityOptions {
  applicationId?: string;
  cursor?: string;
  limit?: number;
  types?: ActivityEventType[];
}

/**
 * Position of the last row returned on the previous page, per source.
 *
 * `created_at` is unix *seconds*, so every message processed in the same second
 * ties. Filtering on `created_at < ?` alone therefore drops the remainder of a
 * tie group: with 30 messages in one second and a page of 25, the 5 left over
 * are filtered out by the next page's `created_at < T` and never appear in the
 * feed or the CSV export.
 *
 * Each source is paginated independently, so each needs its own tiebreaker on a
 * unique column. A source not present on the previous page has no recorded id
 * and falls back to the timestamp filter alone.
 */
interface ActivityCursor {
  beforeTs: number;
  emailProcessedId?: string;
  actionCreatedId?: string;
  actionExecutedId?: string;
}

class ActivityDAO extends BaseDAO {
  public async listForUser(scope: UserScope, options: ListActivityOptions): Promise<ActivityEntryList> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const fetchLimit = limit + 1;
    const cursor = ActivityDAO.parseCursor(options.cursor);

    const activeTypes: ActivityEventType[] =
      options.types && options.types.length > 0 ? options.types : ['email_processed', 'action_created', 'action_executed'];

    const queries: Array<Promise<ActivityEntry[]>> = [];

    if (activeTypes.includes('email_processed')) {
      queries.push(this.queryEmailProcessed(scope, options.applicationId, cursor, fetchLimit));
    }
    if (activeTypes.includes('action_created')) {
      queries.push(this.queryActionCreated(scope, options.applicationId, cursor, fetchLimit));
    }
    if (activeTypes.includes('action_executed')) {
      queries.push(this.queryActionExecuted(scope, options.applicationId, cursor, fetchLimit));
    }

    const results = await Promise.all(queries);
    const merged: ActivityEntry[] = results.flat();
    merged.sort((a: ActivityEntry, b: ActivityEntry): number => ActivityDAO.compareEntries(a, b));

    const pageEntries = merged.slice(0, limit);
    const hasMore = merged.length > limit;

    return {
      entries: pageEntries,
      nextCursor: hasMore && pageEntries.length > 0 ? ActivityDAO.encodeCursor(pageEntries.at(-1)!.timestamp, pageEntries) : undefined,
    };
  }

  /**
   * Newest first, with the source's unique id breaking timestamp ties.
   *
   * The id must match each query's tiebreaker column so the merge order agrees
   * with the per-source `WHERE` clauses; otherwise a page boundary could
   * re-emit or skip a tied row.
   */
  private static compareEntries(a: ActivityEntry, b: ActivityEntry): number {
    return a.timestamp === b.timestamp ? this.entryId(b).localeCompare(this.entryId(a)) : b.timestamp - a.timestamp;
  }

  private static entryId(entry: ActivityEntry): string {
    if (entry.eventType === 'email_processed') return entry.providerMessageId;
    return entry.eventType === 'action_created' ? entry.actionId : entry.executionId;
  }

  /**
   * Append a source's tiebreaker to the WHERE clause.
   *
   * `idColumn` is a hard-coded literal from this file, never caller input.
   */
  private static pushTiebreak(
    conditions: string[],
    bindings: Array<string | number>,
    beforeTs: number | undefined,
    lastId: string | undefined,
    tsExpression: string,
    idColumn: string,
  ): void {
    if (beforeTs === undefined) return;
    if (lastId === undefined) {
      conditions.push(`${tsExpression} < ?`);
      bindings.push(beforeTs);
      return;
    }
    conditions.push(`(${tsExpression} < ? OR (${tsExpression} = ? AND ${idColumn} < ?))`);
    bindings.push(beforeTs, beforeTs, lastId);
  }

  private async queryEmailProcessed(
    scope: UserScope,
    applicationId: string | undefined,
    cursor: ActivityCursor | undefined,
    fetchLimit: number,
  ): Promise<EmailProcessedEntry[]> {
    const where: UserScopeSql = userScopeSql(scope, 'ca');
    const conditions: string[] = [where.clause];
    const bindings: Array<string | number> = [...where.bindings];

    if (applicationId) {
      conditions.push('pm.application_id = ?');
      bindings.push(applicationId);
    }
    ActivityDAO.pushTiebreak(conditions, bindings, cursor?.beforeTs, cursor?.emailProcessedId, 'pm.created_at', 'pm.provider_message_id');

    const rows = await this.database
      .prepare(
        `
          SELECT pm.application_id, pm.provider_message_id, pm.status, pm.error_message, pm.created_at
          FROM processed_messages pm
          INNER JOIN connected_applications ca ON ca.application_id = pm.application_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY pm.created_at DESC, pm.provider_message_id DESC
          LIMIT ?
        `,
      )
      .bind(...bindings, fetchLimit)
      .all<{
        application_id: string;
        provider_message_id: string;
        status: string;
        error_message: string | null;
        created_at: number;
      }>()
      .then((r) => r.results || []);

    return rows.map((row): EmailProcessedEntry => ({
      eventType: 'email_processed',
      applicationId: row.application_id,
      providerMessageId: row.provider_message_id,
      status: row.status as EmailProcessedEntry['status'],
      errorMessage: row.error_message,
      timestamp: row.created_at,
    }));
  }

  private async queryActionCreated(
    scope: UserScope,
    applicationId: string | undefined,
    cursor: ActivityCursor | undefined,
    fetchLimit: number,
  ): Promise<ActionCreatedEntry[]> {
    const where: UserScopeSql = userScopeSql(scope);
    const conditions: string[] = [where.clause];
    const bindings: Array<string | number> = [...where.bindings];

    if (applicationId) {
      conditions.push('application_id = ?');
      bindings.push(applicationId);
    }
    ActivityDAO.pushTiebreak(conditions, bindings, cursor?.beforeTs, cursor?.actionCreatedId, 'created_at', 'action_id');

    const rows = await this.database
      .prepare(
        `
          SELECT action_id, application_id, action_type, risk_level, created_at
          FROM email_summary_actions
          WHERE ${conditions.join(' AND ')}
          ORDER BY created_at DESC, action_id DESC
          LIMIT ?
        `,
      )
      .bind(...bindings, fetchLimit)
      .all<{
        action_id: string;
        application_id: string;
        action_type: string;
        risk_level: string;
        created_at: number;
      }>()
      .then((r) => r.results || []);

    return rows.map((row): ActionCreatedEntry => ({
      eventType: 'action_created',
      applicationId: row.application_id,
      actionId: row.action_id,
      actionType: row.action_type,
      riskLevel: row.risk_level,
      timestamp: row.created_at,
    }));
  }

  private async queryActionExecuted(
    scope: UserScope,
    applicationId: string | undefined,
    cursor: ActivityCursor | undefined,
    fetchLimit: number,
  ): Promise<ActionExecutedEntry[]> {
    const where: UserScopeSql = userScopeSql(scope, 'esa');
    const conditions: string[] = [where.clause];
    const bindings: Array<string | number> = [...where.bindings];

    if (applicationId) {
      conditions.push('esa.application_id = ?');
      bindings.push(applicationId);
    }
    ActivityDAO.pushTiebreak(conditions, bindings, cursor?.beforeTs, cursor?.actionExecutedId, 'eae.created_at', 'eae.execution_id');

    const rows = await this.database
      .prepare(
        `
          SELECT eae.execution_id, esa.action_id, esa.application_id, esa.action_type,
                 eae.status, eae.triggered_by, eae.created_at
          FROM email_action_executions eae
          INNER JOIN email_summary_actions esa ON esa.action_id = eae.action_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY eae.created_at DESC, eae.execution_id DESC
          LIMIT ?
        `,
      )
      .bind(...bindings, fetchLimit)
      .all<{
        execution_id: string;
        action_id: string;
        application_id: string;
        action_type: string;
        status: string;
        triggered_by: string;
        created_at: number;
      }>()
      .then((r) => r.results || []);

    return rows.map((row): ActionExecutedEntry => ({
      eventType: 'action_executed',
      applicationId: row.application_id,
      actionId: row.action_id,
      executionId: row.execution_id,
      actionType: row.action_type,
      executionStatus: row.status,
      triggeredBy: row.triggered_by,
      timestamp: row.created_at,
    }));
  }

  /**
   * Encode the page position: the last timestamp plus each source's last id.
   *
   * A cursor written by the previous `{ beforeTs }`-only shape still decodes,
   * and simply falls back to the timestamp filter, so in-flight clients do not
   * break mid-scroll.
   */
  private static encodeCursor(beforeTs: number, pageEntries: ActivityEntry[]): string {
    // `pageEntries` is newest-first, so the *last* occurrence of a source is
    // that source's oldest row on the page and therefore its resume point.
    // Taking the first would skip every row between the two.
    const lastId = (match: (entry: ActivityEntry) => boolean, id: (entry: ActivityEntry) => string): string | undefined => {
      let found: string | undefined;
      for (const entry of pageEntries) {
        if (match(entry)) found = id(entry);
      }
      return found;
    };
    const isProcessed = (entry: ActivityEntry): boolean => entry.eventType === 'email_processed';
    const isCreated = (entry: ActivityEntry): boolean => entry.eventType === 'action_created';
    const isExecuted = (entry: ActivityEntry): boolean => entry.eventType === 'action_executed';
    return CursorUtil.encode({
      beforeTs,
      emailProcessedId: lastId(isProcessed, (entry) => (entry as EmailProcessedEntry).providerMessageId),
      actionCreatedId: lastId(isCreated, (entry) => (entry as ActionCreatedEntry).actionId),
      actionExecutedId: lastId(isExecuted, (entry) => (entry as ActionExecutedEntry).executionId),
    });
  }

  private static parseCursor(cursor: string | undefined): ActivityCursor | undefined {
    const parsed = CursorUtil.decode<{
      beforeTs?: unknown;
      emailProcessedId?: unknown;
      actionCreatedId?: unknown;
      actionExecutedId?: unknown;
    }>(cursor);
    if (!parsed || typeof parsed.beforeTs !== 'number') return undefined;
    const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
    return {
      beforeTs: parsed.beforeTs,
      emailProcessedId: asString(parsed.emailProcessedId),
      actionCreatedId: asString(parsed.actionCreatedId),
      actionExecutedId: asString(parsed.actionExecutedId),
    };
  }
}

export { ActivityDAO };
export type { ListActivityOptions };
