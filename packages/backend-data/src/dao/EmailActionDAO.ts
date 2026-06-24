import {
  EMAIL_ACTION_STATUS_EXECUTING,
  EMAIL_ACTION_STATUS_EXPIRED,
  EMAIL_ACTION_STATUS_FAILED,
  EMAIL_ACTION_STATUS_PENDING,
  EMAIL_ACTION_STATUS_SUCCEEDED,
} from '@mail-otter/shared/constants';
import { decryptDataWithSalt, encryptDataWithSalt } from '../crypto';
import { CursorUtil, executeD1WithRetry } from '../utils';
import type {
  EmailAction,
  EmailActionExecution,
  EmailActionExecutionInternal,
  EmailActionExecutionList,
  EmailActionInternal,
  EmailActionList,
  EmailActionPayload,
  EmailActionResult,
} from '@mail-otter/shared/model';
import type { EmailActionExecutionTrigger, EmailActionRiskLevel, EmailActionStatus, EmailActionType, ProviderId } from '@mail-otter/shared/constants';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { EncryptedDAO } from './BaseDAO';

class EmailActionDAO extends EncryptedDAO {

  public async create(input: CreateEmailActionInput): Promise<EmailAction> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const encryptedPayload = await encryptDataWithSalt(JSON.stringify(input.payload), this.masterKey);
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO email_summary_actions
                (action_id, processed_message_id, application_id, user_email, provider_id, provider_message_id, provider_thread_id,
                 action_type, status, risk_level, token_hash, encrypted_payload, payload_iv, payload_salt,
                 encrypted_result, result_iv, result_salt, error_message, expires_at, executed_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, ?, ?)
            `,
          )
          .bind(
            input.actionId,
            input.processedMessageId,
            input.applicationId,
            input.userEmail,
            input.providerId,
            input.providerMessageId,
            input.providerThreadId || null,
            input.actionType,
            EMAIL_ACTION_STATUS_PENDING,
            input.riskLevel,
            input.tokenHash,
            encryptedPayload.encrypted,
            encryptedPayload.iv,
            encryptedPayload.salt,
            input.expiresAt,
            now,
            now,
          )
          .run(),
      'create email action',
    );
    const action: EmailAction | undefined = await this.getById(input.actionId);
    if (!action) throw new Error('Failed to load email action after create.');
    return action;
  }

  public async listActionsForUser(userEmail: string, input: ListEmailActionsInput = {}): Promise<EmailActionList> {
    const limit: number = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const conditions: string[] = ['user_email = ?'];
    const bindings: Array<string | number> = [userEmail];
    if (input.applicationId) {
      conditions.push('application_id = ?');
      bindings.push(input.applicationId);
    }
    if (input.status) {
      conditions.push('status = ?');
      bindings.push(input.status);
    }
    const cursor = EmailActionDAO.parseCursor(input.cursor);
    if (cursor) {
      conditions.push('(updated_at < ? OR (updated_at = ? AND created_at < ?))');
      bindings.push(cursor.updatedAt, cursor.updatedAt, cursor.createdAt);
    }
    const rows: EmailActionInternal[] = await this.database
      .prepare(
        `
          SELECT ${EmailActionDAO.actionColumns}
          FROM email_summary_actions
          WHERE ${conditions.join(' AND ')}
          ORDER BY updated_at DESC, created_at DESC
          LIMIT ?
        `,
      )
      .bind(...bindings, limit + 1)
      .all<EmailActionInternal>()
      .then((result: D1Result<EmailActionInternal>): EmailActionInternal[] => result.results || []);
    const pageRows: EmailActionInternal[] = rows.slice(0, limit);
    const actions: EmailAction[] = await Promise.all(pageRows.map((row: EmailActionInternal): Promise<EmailAction> => this.toAction(row)));
    return {
      actions,
      nextCursor:
        rows.length > limit
          ? EmailActionDAO.encodeCursor(pageRows[pageRows.length - 1].updated_at, pageRows[pageRows.length - 1].created_at)
          : undefined,
    };
  }

  public async getForUser(actionId: string, userEmail: string): Promise<EmailAction | undefined> {
    const row: EmailActionInternal | null = await this.database
      .prepare(
        `
          SELECT ${EmailActionDAO.actionColumns}
          FROM email_summary_actions
          WHERE action_id = ? AND user_email = ?
          LIMIT 1
        `,
      )
      .bind(actionId, userEmail)
      .first<EmailActionInternal>();
    return row ? this.toAction(row) : undefined;
  }

  public async getByTokenHash(actionId: string, tokenHash: string): Promise<EmailAction | undefined> {
    const row: EmailActionInternal | null = await this.database
      .prepare(
        `
          SELECT ${EmailActionDAO.actionColumns}
          FROM email_summary_actions
          WHERE action_id = ? AND token_hash = ?
          LIMIT 1
        `,
      )
      .bind(actionId, tokenHash)
      .first<EmailActionInternal>();
    return row ? this.toAction(row) : undefined;
  }

  public async claimForExecution(actionId: string): Promise<boolean> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE email_summary_actions
              SET status = ?, updated_at = ?
              WHERE action_id = ? AND status = ? AND expires_at > ?
            `,
          )
          .bind(EMAIL_ACTION_STATUS_EXECUTING, now, actionId, EMAIL_ACTION_STATUS_PENDING, now)
          .run(),
      'claim email action for execution',
    );
    return ((result.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
  }

  public async markSucceeded(actionId: string, result: EmailActionResult): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const encryptedResult = await encryptDataWithSalt(JSON.stringify(result), this.masterKey);
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE email_summary_actions
              SET status = ?, encrypted_result = ?, result_iv = ?, result_salt = ?, error_message = NULL, executed_at = ?, updated_at = ?
              WHERE action_id = ?
            `,
          )
          .bind(
            EMAIL_ACTION_STATUS_SUCCEEDED,
            encryptedResult.encrypted,
            encryptedResult.iv,
            encryptedResult.salt,
            now,
            now,
            actionId,
          )
          .run(),
      'mark email action succeeded',
    );
  }

  public async markFailed(actionId: string, errorMessage: string): Promise<void> {
    await this.updateStatus(actionId, EMAIL_ACTION_STATUS_FAILED, errorMessage, true);
  }

  public async markExpired(actionId: string): Promise<void> {
    await this.updateStatus(actionId, EMAIL_ACTION_STATUS_EXPIRED, null, false);
  }

  public async expirePendingActions(now: number, limit: number): Promise<number> {
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE email_summary_actions
              SET status = ?, updated_at = ?
              WHERE action_id IN (
                SELECT action_id
                FROM email_summary_actions
                WHERE status = ? AND expires_at <= ?
                LIMIT ?
              )
            `,
          )
          .bind(EMAIL_ACTION_STATUS_EXPIRED, now, EMAIL_ACTION_STATUS_PENDING, now, limit)
          .run(),
      'expire pending email actions',
    );
    return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  }

  public async deleteByProcessedMessageId(processedMessageId: string): Promise<number> {
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              DELETE FROM email_summary_actions
              WHERE processed_message_id = ? AND status = ?
            `,
          )
          .bind(processedMessageId, EMAIL_ACTION_STATUS_PENDING)
          .run(),
      'delete pending email actions by processed message',
    );
    return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  }

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

  public async listPendingActionsByTypes(applicationId: string, actionTypes: string[], limit: number = 100): Promise<EmailAction[]> {
    if (actionTypes.length === 0) return [];
    const placeholders: string = actionTypes.map(() => '?').join(', ');
    const rows: EmailActionInternal[] = await this.database
      .prepare(
        `
          SELECT ${EmailActionDAO.actionColumns}
          FROM email_summary_actions
          WHERE application_id = ? AND status = ? AND action_type IN (${placeholders})
          ORDER BY created_at ASC
          LIMIT ?
        `,
      )
      .bind(applicationId, EMAIL_ACTION_STATUS_PENDING, ...actionTypes, limit)
      .all<EmailActionInternal>()
      .then((result: D1Result<EmailActionInternal>): EmailActionInternal[] => result.results || []);
    return Promise.all(rows.map((row: EmailActionInternal): Promise<EmailAction> => this.toAction(row)));
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

  public async deleteOlderThan(olderThan: number, limit: number): Promise<number> {
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              DELETE FROM email_summary_actions
              WHERE updated_at < ? AND status IN (?, ?, ?, ?)
              LIMIT ?
            `,
          )
          .bind(
            olderThan,
            EMAIL_ACTION_STATUS_SUCCEEDED,
            EMAIL_ACTION_STATUS_FAILED,
            EMAIL_ACTION_STATUS_EXPIRED,
            EMAIL_ACTION_STATUS_PENDING,
            limit,
          )
          .run(),
      'delete old email actions',
    );
    return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
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
    return { executions: rows.map((row: EmailActionExecutionInternal): EmailActionExecution => EmailActionDAO.toExecution(row)) };
  }

  public async listExecutionsForUser(actionId: string, userEmail: string): Promise<EmailActionExecutionList> {
    const action: EmailAction | undefined = await this.getForUser(actionId, userEmail);
    if (!action) return { executions: [] };
    return this.listExecutions(actionId);
  }

  private async getById(actionId: string): Promise<EmailAction | undefined> {
    const row: EmailActionInternal | null = await this.database
      .prepare(
        `
          SELECT ${EmailActionDAO.actionColumns}
          FROM email_summary_actions
          WHERE action_id = ?
          LIMIT 1
        `,
      )
      .bind(actionId)
      .first<EmailActionInternal>();
    return row ? this.toAction(row) : undefined;
  }

  private async updateStatus(actionId: string, status: EmailActionStatus, errorMessage: string | null, executed: boolean): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE email_summary_actions
              SET status = ?, error_message = ?, executed_at = CASE WHEN ? THEN ? ELSE executed_at END, updated_at = ?
              WHERE action_id = ?
            `,
          )
          .bind(status, errorMessage ? errorMessage.slice(0, 1024) : null, executed ? 1 : 0, now, now, actionId)
          .run(),
      'update email action status',
    );
  }

  private async countExecutions(actionId: string): Promise<number> {
    const row: { count: number } | null = await this.database
      .prepare('SELECT COUNT(*) AS count FROM email_action_executions WHERE action_id = ?')
      .bind(actionId)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  private async toAction(row: EmailActionInternal): Promise<EmailAction> {
    const payload = JSON.parse(await decryptDataWithSalt(row.encrypted_payload, row.payload_iv, row.payload_salt, this.masterKey)) as EmailActionPayload;
    const result: EmailActionResult | null =
      row.encrypted_result && row.result_iv && row.result_salt
        ? (JSON.parse(await decryptDataWithSalt(row.encrypted_result, row.result_iv, row.result_salt, this.masterKey)) as EmailActionResult)
        : null;
    return {
      actionId: row.action_id,
      processedMessageId: row.processed_message_id,
      applicationId: row.application_id,
      userEmail: row.user_email,
      providerId: row.provider_id,
      providerMessageId: row.provider_message_id,
      providerThreadId: row.provider_thread_id,
      actionType: row.action_type,
      status: row.status,
      riskLevel: row.risk_level,
      title: payload.title,
      description: payload.description,
      payload,
      result,
      errorMessage: row.error_message,
      syncStatus: row.sync_status,
      expiresAt: row.expires_at,
      executedAt: row.executed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
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

  private static encodeCursor(updatedAt: number, createdAt: number): string {
    return CursorUtil.encode({ updatedAt, createdAt });
  }

  private static parseCursor(cursor: string | undefined): { updatedAt: number; createdAt: number } | undefined {
    const parsed = CursorUtil.decode<{ updatedAt?: unknown; createdAt?: unknown }>(cursor);
    if (parsed && typeof parsed.updatedAt === 'number' && typeof parsed.createdAt === 'number') {
      return { updatedAt: parsed.updatedAt, createdAt: parsed.createdAt };
    }
    return undefined;
  }

  private static readonly actionColumns: string = [
    'action_id',
    'processed_message_id',
    'application_id',
    'user_email',
    'provider_id',
    'provider_message_id',
    'provider_thread_id',
    'action_type',
    'status',
    'risk_level',
    'token_hash',
    'encrypted_payload',
    'payload_iv',
    'payload_salt',
    'encrypted_result',
    'result_iv',
    'result_salt',
    'error_message',
    'sync_status',
    'expires_at',
    'executed_at',
    'created_at',
    'updated_at',
  ].join(', ');
}

interface CreateEmailActionInput {
  actionId: string;
  processedMessageId: string;
  applicationId: string;
  userEmail: string;
  providerId: ProviderId;
  providerMessageId: string;
  providerThreadId?: string | null | undefined;
  actionType: EmailActionType;
  riskLevel: EmailActionRiskLevel;
  tokenHash: string;
  payload: EmailActionPayload;
  expiresAt: number;
}

interface ListEmailActionsInput {
  applicationId?: string | undefined;
  status?: EmailActionStatus | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

interface RecordEmailActionExecutionInput {
  actionId: string;
  triggeredBy: EmailActionExecutionTrigger;
  status: EmailActionStatus;
  attempt?: number | undefined;
  providerOperationId?: string | null | undefined;
  requestUserAgentHash?: string | null | undefined;
  errorMessage?: string | null | undefined;
  createdAt?: number | undefined;
  completedAt?: number | null | undefined;
}

interface EmailActionCounts {
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}

export { EmailActionDAO };
export type { CreateEmailActionInput, EmailActionCounts, ListEmailActionsInput, RecordEmailActionExecutionInput };
