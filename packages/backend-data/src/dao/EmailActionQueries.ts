import { executeD1WithRetry } from '../utils';
import type { EmailActionExecution, EmailActionExecutionInternal, EmailActionExecutionList } from '@mail-otter/shared/model';
import type { EmailActionExecutionTrigger, EmailActionStatus } from '@mail-otter/shared/constants';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';

// Execution/count query concerns extracted from EmailActionDAO god-file.
// EmailActionDAO delegates to this helper (composition) to keep public
// signatures stable while reducing the facade size.
class EmailActionQueries extends BaseDAO {
  public async getCountsByUserAndDateRange(
    userEmail: string,
    sinceUnixSeconds: number,
    untilUnixSeconds: number,
    applicationId?: string,
  ): Promise<EmailActionCounts> {
    const conditions: string[] = ['user_email = ?', 'created_at >= ?', 'created_at <= ?'];
    const bindings: Array<string | number> = [userEmail, sinceUnixSeconds, untilUnixSeconds];
    if (applicationId) {
      conditions.push('application_id = ?');
      bindings.push(applicationId);
    }
    const where: string = conditions.join(' AND ');

    const byStatusRows: Array<{ status: string; cnt: number }> = await this.database
      .prepare(`SELECT status, COUNT(*) AS cnt FROM email_summary_actions WHERE ${where} GROUP BY status`)
      .bind(...bindings)
      .all<{ status: string; cnt: number }>()
      .then((result: D1Result<{ status: string; cnt: number }>): Array<{ status: string; cnt: number }> => result.results || []);

    const byTypeRows: Array<{ action_type: string; cnt: number }> = await this.database
      .prepare(`SELECT action_type, COUNT(*) AS cnt FROM email_summary_actions WHERE ${where} GROUP BY action_type`)
      .bind(...bindings)
      .all<{ action_type: string; cnt: number }>()
      .then((result: D1Result<{ action_type: string; cnt: number }>): Array<{ action_type: string; cnt: number }> => result.results || []);

    const byStatus: Record<string, number> = {};
    for (const row of byStatusRows) byStatus[row.status] = row.cnt;

    const byType: Record<string, number> = {};
    for (const row of byTypeRows) byType[row.action_type] = row.cnt;

    return { byStatus, byType };
  }

  public async recordExecution(input: RecordEmailActionExecutionInput): Promise<EmailActionExecution> {
    const createdAt: number = input.createdAt ?? TimestampUtil.getCurrentUnixTimestampInSeconds();
    const executionId: string = UUIDUtil.getRandomUUID();
    const attempt: number = input.attempt ?? (await this.countExecutions(input.actionId)) + 1;
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO email_action_executions
                (execution_id, action_id, attempt, triggered_by, status, provider_operation_id, request_user_agent_hash,
                 error_message, created_at, completed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .bind(
            executionId,
            input.actionId,
            attempt,
            input.triggeredBy,
            input.status,
            input.providerOperationId || null,
            input.requestUserAgentHash || null,
            input.errorMessage ? input.errorMessage.slice(0, 1024) : null,
            createdAt,
            input.completedAt ?? createdAt,
          )
          .run(),
      'record email action execution',
    );
    const executions: EmailActionExecutionList = await this.listExecutions(input.actionId);
    const execution: EmailActionExecution | undefined = executions.executions.find((item) => item.executionId === executionId);
    if (!execution) throw new Error('Failed to load email action execution after create.');
    return execution;
  }

  public async listExecutions(actionId: string): Promise<EmailActionExecutionList> {
    const rows: EmailActionExecutionInternal[] = await this.database
      .prepare(
        `
          SELECT execution_id, action_id, attempt, triggered_by, status, provider_operation_id, request_user_agent_hash,
                 error_message, created_at, completed_at
          FROM email_action_executions
          WHERE action_id = ?
          ORDER BY created_at DESC, attempt DESC
        `,
      )
      .bind(actionId)
      .all<EmailActionExecutionInternal>()
      .then((result: D1Result<EmailActionExecutionInternal>): EmailActionExecutionInternal[] => result.results || []);
    return { executions: rows.map((row: EmailActionExecutionInternal): EmailActionExecution => EmailActionQueries.toExecution(row)) };
  }

  public async updateSyncStatus(actionId: string, syncStatus: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('UPDATE email_summary_actions SET sync_status = ?, sync_updated_at = ? WHERE action_id = ?')
          .bind(syncStatus, now, actionId)
          .run(),
      'update action sync status',
    );
  }

  public async getSyncStatus(actionId: string): Promise<{ syncStatus: string | null; syncUpdatedAt: number | null } | undefined> {
    const row: { sync_status: string | null; sync_updated_at: number | null } | null = await this.database
      .prepare('SELECT sync_status, sync_updated_at FROM email_summary_actions WHERE action_id = ?')
      .bind(actionId)
      .first<{ sync_status: string | null; sync_updated_at: number | null }>();
    if (!row) return undefined;
    return { syncStatus: row.sync_status, syncUpdatedAt: row.sync_updated_at };
  }

  public async deleteOlderThan(olderThan: number, limit: number, terminalStatuses: string[]): Promise<number> {
    const placeholders: string = terminalStatuses.map((): string => '?').join(', ');
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              DELETE FROM email_summary_actions
              WHERE action_id IN (
                SELECT action_id FROM email_summary_actions
                WHERE updated_at < ? AND status IN (${placeholders})
                LIMIT ?
              )
            `,
          )
          .bind(olderThan, ...terminalStatuses, limit)
          .run(),
      'delete old email actions',
    );
    return (result.meta as { changes?: number })?.changes ?? 0;
  }

  private async countExecutions(actionId: string): Promise<number> {
    const row: { count: number } | null = await this.database
      .prepare('SELECT COUNT(*) AS count FROM email_action_executions WHERE action_id = ?')
      .bind(actionId)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  private static toExecution(row: EmailActionExecutionInternal): EmailActionExecution {
    return {
      executionId: row.execution_id,
      actionId: row.action_id,
      attempt: row.attempt,
      triggeredBy: row.triggered_by,
      status: row.status,
      providerOperationId: row.provider_operation_id,
      requestUserAgentHash: row.request_user_agent_hash,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }
}

interface RecordEmailActionExecutionInput {
  actionId: string;
  triggeredBy: EmailActionExecutionTrigger;
  status: EmailActionStatus;
  attempt?: number;
  providerOperationId?: string | null;
  requestUserAgentHash?: string | null;
  errorMessage?: string | null;
  createdAt?: number;
  completedAt?: number | null;
}

interface EmailActionCounts {
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}

export { EmailActionQueries };
export type { EmailActionCounts, RecordEmailActionExecutionInput };
