import type { IntegrationDeliveryLog, IntegrationDeliveryLogInternal, IntegrationDeliveryStatus } from '@mail-otter/shared/model';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';

interface CreateDeliveryLogInput {
  integrationId: string;
  applicationId: string;
  status: IntegrationDeliveryStatus;
  httpStatus: number | null;
  errorMessage: string | null;
  emailSubject: string | null;
}

class IntegrationDeliveryLogDAO extends BaseDAO {

  public async create(input: CreateDeliveryLogInput): Promise<IntegrationDeliveryLog> {
    const logId = UUIDUtil.getRandomUUID();
    const createdAt = TimestampUtil.getCurrentUnixTimestampInSeconds();

    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO integration_delivery_logs
             (log_id, integration_id, application_id, status, http_status, error_message, email_subject, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(logId, input.integrationId, input.applicationId, input.status, input.httpStatus ?? null, input.errorMessage ?? null, input.emailSubject ?? null, createdAt),
      this.database
        .prepare(
          `UPDATE application_integrations
           SET last_delivery_at = ?,
               last_delivery_status = ?,
               consecutive_failures = CASE WHEN ? = 'success' THEN 0 ELSE consecutive_failures + 1 END
           WHERE integration_id = ?`,
        )
        .bind(createdAt, input.status, input.status, input.integrationId),
    ]);

    return this.toPublic({
      log_id: logId,
      integration_id: input.integrationId,
      application_id: input.applicationId,
      status: input.status,
      http_status: input.httpStatus ?? null,
      error_message: input.errorMessage ?? null,
      email_subject: input.emailSubject ?? null,
      created_at: createdAt,
    });
  }

  public async listByIntegrationId(integrationId: string, limit: number): Promise<IntegrationDeliveryLog[]> {
    const rows = await this.database
      .prepare(
        'SELECT * FROM integration_delivery_logs WHERE integration_id = ? ORDER BY created_at DESC LIMIT ?',
      )
      .bind(integrationId, limit)
      .all<IntegrationDeliveryLogInternal>()
      .then((r) => r.results ?? []);
    return rows.map((row) => this.toPublic(row));
  }

  public async deleteOlderThan(olderThan: number, batchSize: number): Promise<number> {
    const result = await this.database
      .prepare(
        `DELETE FROM integration_delivery_logs
         WHERE log_id IN (
           SELECT log_id FROM integration_delivery_logs WHERE created_at < ? LIMIT ?
         )`,
      )
      .bind(olderThan, batchSize)
      .run();
    return result.meta.changes ?? 0;
  }

  private toPublic(row: IntegrationDeliveryLogInternal): IntegrationDeliveryLog {
    return {
      logId: row.log_id,
      integrationId: row.integration_id,
      applicationId: row.application_id,
      status: row.status as IntegrationDeliveryStatus,
      httpStatus: row.http_status,
      errorMessage: row.error_message,
      emailSubject: row.email_subject,
      createdAt: row.created_at,
    };
  }
}

export { IntegrationDeliveryLogDAO };
export type { CreateDeliveryLogInput };
