import { CursorUtil } from '../utils';
import type {
  ActivityEntry,
  ActivityEntryList,
  ActivityEventType,
  ActionCreatedEntry,
  ActionExecutedEntry,
  EmailProcessedEntry,
} from '@mail-otter/shared/model';
import { BaseDAO } from './BaseDAO';

interface ListActivityOptions {
  applicationId?: string;
  cursor?: string;
  limit?: number;
  types?: ActivityEventType[];
}

class ActivityDAO extends BaseDAO {
  public async listForUser(userEmail: string, options: ListActivityOptions): Promise<ActivityEntryList> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const fetchLimit = limit + 1;
    const cursor = ActivityDAO.parseCursor(options.cursor);
    const beforeTs = cursor?.beforeTs;

    const activeTypes: ActivityEventType[] =
      options.types && options.types.length > 0
        ? options.types
        : ['email_processed', 'action_created', 'action_executed'];

    const queries: Array<Promise<ActivityEntry[]>> = [];

    if (activeTypes.includes('email_processed')) {
      queries.push(this.queryEmailProcessed(userEmail, options.applicationId, beforeTs, fetchLimit));
    }
    if (activeTypes.includes('action_created')) {
      queries.push(this.queryActionCreated(userEmail, options.applicationId, beforeTs, fetchLimit));
    }
    if (activeTypes.includes('action_executed')) {
      queries.push(this.queryActionExecuted(userEmail, options.applicationId, beforeTs, fetchLimit));
    }

    const results = await Promise.all(queries);
    const merged: ActivityEntry[] = results.flat();
    merged.sort((a, b) => b.timestamp - a.timestamp);

    const pageEntries = merged.slice(0, limit);
    const hasMore = merged.length > limit;

    return {
      entries: pageEntries,
      nextCursor:
        hasMore && pageEntries.length > 0
          ? ActivityDAO.encodeCursor(pageEntries.at(-1)!.timestamp)
          : undefined,
    };
  }

  private async queryEmailProcessed(
    userEmail: string,
    applicationId: string | undefined,
    beforeTs: number | undefined,
    fetchLimit: number,
  ): Promise<EmailProcessedEntry[]> {
    const conditions: string[] = ['ca.user_email = ?'];
    const bindings: Array<string | number> = [userEmail];

    if (applicationId) {
      conditions.push('pm.application_id = ?');
      bindings.push(applicationId);
    }
    if (beforeTs !== undefined) {
      conditions.push('pm.created_at < ?');
      bindings.push(beforeTs);
    }

    const rows = await this.database
      .prepare(
        `
          SELECT pm.application_id, pm.provider_message_id, pm.status, pm.error_message, pm.created_at
          FROM processed_messages pm
          INNER JOIN connected_applications ca ON ca.application_id = pm.application_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY pm.created_at DESC
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
    userEmail: string,
    applicationId: string | undefined,
    beforeTs: number | undefined,
    fetchLimit: number,
  ): Promise<ActionCreatedEntry[]> {
    const conditions: string[] = ['user_email = ?'];
    const bindings: Array<string | number> = [userEmail];

    if (applicationId) {
      conditions.push('application_id = ?');
      bindings.push(applicationId);
    }
    if (beforeTs !== undefined) {
      conditions.push('created_at < ?');
      bindings.push(beforeTs);
    }

    const rows = await this.database
      .prepare(
        `
          SELECT action_id, application_id, action_type, risk_level, created_at
          FROM email_summary_actions
          WHERE ${conditions.join(' AND ')}
          ORDER BY created_at DESC
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
    userEmail: string,
    applicationId: string | undefined,
    beforeTs: number | undefined,
    fetchLimit: number,
  ): Promise<ActionExecutedEntry[]> {
    const conditions: string[] = ['esa.user_email = ?'];
    const bindings: Array<string | number> = [userEmail];

    if (applicationId) {
      conditions.push('esa.application_id = ?');
      bindings.push(applicationId);
    }
    if (beforeTs !== undefined) {
      conditions.push('eae.created_at < ?');
      bindings.push(beforeTs);
    }

    const rows = await this.database
      .prepare(
        `
          SELECT eae.execution_id, esa.action_id, esa.application_id, esa.action_type,
                 eae.status, eae.triggered_by, eae.created_at
          FROM email_action_executions eae
          INNER JOIN email_summary_actions esa ON esa.action_id = eae.action_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY eae.created_at DESC
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
      actionType: row.action_type,
      executionStatus: row.status,
      triggeredBy: row.triggered_by,
      timestamp: row.created_at,
    }));
  }

  private static encodeCursor(beforeTs: number): string {
    return CursorUtil.encode({ beforeTs });
  }

  private static parseCursor(cursor: string | undefined): { beforeTs: number } | undefined {
    const parsed = CursorUtil.decode<{ beforeTs?: unknown }>(cursor);
    if (parsed && typeof parsed.beforeTs === 'number') {
      return { beforeTs: parsed.beforeTs };
    }
    return undefined;
  }
}

export { ActivityDAO };
export type { ListActivityOptions };
