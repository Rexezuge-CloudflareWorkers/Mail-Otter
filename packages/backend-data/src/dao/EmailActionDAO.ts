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
  EmailActionExecutionList,
  EmailActionInternal,
  EmailActionList,
  EmailActionPayload,
  EmailActionResult,
} from '@mail-otter/shared/model';
import type { EmailActionRiskLevel, EmailActionStatus, EmailActionType, ProviderId } from '@mail-otter/shared/constants';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { EncryptedDAO } from './BaseDAO';
import { EmailActionQueries } from './EmailActionQueries';
import type { EmailActionCounts, RecordEmailActionExecutionInput } from './EmailActionQueries';

class EmailActionDAO extends EncryptedDAO {
  private queries(): EmailActionQueries {
    return new EmailActionQueries(this.database);
  }

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
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
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
    if (!input.showSnoozed) {
      conditions.push('(snoozed_until IS NULL OR snoozed_until <= ?)');
      bindings.push(now);
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
      nextCursor: rows.length > limit ? EmailActionDAO.encodeCursor(pageRows.at(-1)!.updated_at, pageRows.at(-1)!.created_at) : undefined,
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
    return ((result.meta as { changes?: number })?.changes ?? 0) > 0;
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
          .bind(EMAIL_ACTION_STATUS_SUCCEEDED, encryptedResult.encrypted, encryptedResult.iv, encryptedResult.salt, now, now, actionId)
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
    return (result.meta as { changes?: number })?.changes ?? 0;
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
    return (result.meta as { changes?: number })?.changes ?? 0;
  }

  public async getCountsByUserAndDateRange(
    userEmail: string,
    sinceUnixSeconds: number,
    untilUnixSeconds: number,
    applicationId?: string,
  ): Promise<EmailActionCounts> {
    return this.queries().getCountsByUserAndDateRange(userEmail, sinceUnixSeconds, untilUnixSeconds, applicationId);
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

  public async snoozeAction(actionId: string, snoozedUntil: number, newExpiresAt: number): Promise<boolean> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE email_summary_actions
              SET snoozed_until = ?, expires_at = MAX(expires_at, ?), updated_at = ?
              WHERE action_id = ? AND status = ?
            `,
          )
          .bind(snoozedUntil, newExpiresAt, now, actionId, EMAIL_ACTION_STATUS_PENDING)
          .run(),
      'snooze email action',
    );
    return ((result.meta as { changes?: number })?.changes ?? 0) > 0;
  }

  public async cancelSnooze(actionId: string): Promise<boolean> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE email_summary_actions
              SET snoozed_until = NULL, updated_at = ?
              WHERE action_id = ? AND status = ?
            `,
          )
          .bind(now, actionId, EMAIL_ACTION_STATUS_PENDING)
          .run(),
      'cancel email action snooze',
    );
    return ((result.meta as { changes?: number })?.changes ?? 0) > 0;
  }

  public async scheduleAction(actionId: string, scheduledFor: number, newExpiresAt: number): Promise<boolean> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE email_summary_actions
              SET scheduled_for = ?, expires_at = MAX(expires_at, ?), updated_at = ?
              WHERE action_id = ? AND status = ?
            `,
          )
          .bind(scheduledFor, newExpiresAt, now, actionId, EMAIL_ACTION_STATUS_PENDING)
          .run(),
      'schedule email action',
    );
    return ((result.meta as { changes?: number })?.changes ?? 0) > 0;
  }

  public async cancelSchedule(actionId: string): Promise<boolean> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE email_summary_actions
              SET scheduled_for = NULL, updated_at = ?
              WHERE action_id = ? AND status = ?
            `,
          )
          .bind(now, actionId, EMAIL_ACTION_STATUS_PENDING)
          .run(),
      'cancel email action schedule',
    );
    return ((result.meta as { changes?: number })?.changes ?? 0) > 0;
  }

  public async listPendingScheduledActions(now: number, limit: number): Promise<EmailAction[]> {
    const rows: EmailActionInternal[] = await this.database
      .prepare(
        `
          SELECT ${EmailActionDAO.actionColumns}
          FROM email_summary_actions
          WHERE status = ?
            AND scheduled_for IS NOT NULL
            AND scheduled_for <= ?
            AND (snoozed_until IS NULL OR snoozed_until <= ?)
          ORDER BY scheduled_for ASC
          LIMIT ?
        `,
      )
      .bind(EMAIL_ACTION_STATUS_PENDING, now, now, limit)
      .all<EmailActionInternal>()
      .then((result: D1Result<EmailActionInternal>): EmailActionInternal[] => result.results || []);
    return Promise.all(rows.map((row: EmailActionInternal): Promise<EmailAction> => this.toAction(row)));
  }

  public async updateSyncStatus(actionId: string, syncStatus: string): Promise<void> {
    await this.queries().updateSyncStatus(actionId, syncStatus);
  }

  public async getSyncStatus(actionId: string): Promise<{ syncStatus: string | null; syncUpdatedAt: number | null } | undefined> {
    return this.queries().getSyncStatus(actionId);
  }

  public async deleteOlderThan(olderThan: number, limit: number): Promise<number> {
    return this.queries().deleteOlderThan(olderThan, limit, [
      EMAIL_ACTION_STATUS_SUCCEEDED,
      EMAIL_ACTION_STATUS_FAILED,
      EMAIL_ACTION_STATUS_EXPIRED,
      EMAIL_ACTION_STATUS_PENDING,
    ]);
  }

  public async recordExecution(input: RecordEmailActionExecutionInput): Promise<EmailActionExecution> {
    return this.queries().recordExecution(input);
  }

  public async listExecutions(actionId: string): Promise<EmailActionExecutionList> {
    return this.queries().listExecutions(actionId);
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

  private async toAction(row: EmailActionInternal): Promise<EmailAction> {
    const payload = JSON.parse(
      await decryptDataWithSalt(row.encrypted_payload, row.payload_iv, row.payload_salt, this.masterKey),
    ) as EmailActionPayload;
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
      snoozedUntil: row.snoozed_until,
      scheduledFor: row.scheduled_for,
      expiresAt: row.expires_at,
      executedAt: row.executed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
    'snoozed_until',
    'scheduled_for',
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
  providerThreadId?: string | null;
  actionType: EmailActionType;
  riskLevel: EmailActionRiskLevel;
  tokenHash: string;
  payload: EmailActionPayload;
  expiresAt: number;
}

interface ListEmailActionsInput {
  applicationId?: string;
  status?: EmailActionStatus;
  cursor?: string;
  limit?: number;
  showSnoozed?: boolean;
}

export { EmailActionDAO };
export type { CreateEmailActionInput, ListEmailActionsInput };
export type { EmailActionCounts, RecordEmailActionExecutionInput } from './EmailActionQueries';
