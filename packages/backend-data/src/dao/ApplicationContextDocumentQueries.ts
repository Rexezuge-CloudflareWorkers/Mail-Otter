import { APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE, APPLICATION_CONTEXT_DOCUMENT_STATUS_DELETED } from '@mail-otter/shared/constants';
import { executeD1WithRetry } from '../utils';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';

// Vector/limit query concerns extracted from ApplicationContextDAO god-file.
// ApplicationContextDAO delegates to this helper (composition) to keep public
// signatures stable while reducing the facade size.
class ApplicationContextDocumentQueries extends BaseDAO {
  public async listActiveVectorIdsForApplication(applicationId: string, userEmail: string): Promise<string[]> {
    const rows: Array<{ vector_id: string }> = await this.database
      .prepare(
        `
          SELECT vector_id
          FROM application_context_documents
          WHERE application_id = ? AND user_email = ? AND status = ?
        `,
      )
      .bind(applicationId, userEmail, APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE)
      .all<{ vector_id: string }>()
      .then((result: D1Result<{ vector_id: string }>): Array<{ vector_id: string }> => result.results || []);
    return rows.map((row: { vector_id: string }): string => row.vector_id);
  }

  public async listOldestActiveVectorIdsForApplication(applicationId: string, userEmail: string, count: number): Promise<string[]> {
    const rows = await this.database
      .prepare(
        `
          SELECT vector_id
          FROM application_context_documents
          WHERE application_id = ? AND user_email = ? AND status = ?
          ORDER BY created_at ASC
          LIMIT ?
        `,
      )
      .bind(applicationId, userEmail, APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE, count)
      .all<{ vector_id: string }>()
      .then((r) => r.results || []);
    return rows.map((r) => r.vector_id);
  }

  public async getDocumentSourcesByVectorIds(
    applicationId: string,
    userEmail: string,
    vectorIds: string[],
  ): Promise<Array<{ contextDocumentId: string; sourceDocumentId: string | null }>> {
    if (vectorIds.length === 0) return [];
    const rows: Array<{ context_document_id: string; source_document_id: string | null }> = [];
    for (const chunk of ApplicationContextDocumentQueries.chunk(vectorIds, 100)) {
      const placeholders: string = chunk.map((): string => '?').join(', ');
      const result: Array<{ context_document_id: string; source_document_id: string | null }> = await this.database
        .prepare(
          `
            SELECT context_document_id, source_document_id
            FROM application_context_documents
            WHERE application_id = ? AND user_email = ? AND vector_id IN (${placeholders})
          `,
        )
        .bind(applicationId, userEmail, ...chunk)
        .all<{ context_document_id: string; source_document_id: string | null }>()
        .then((r) => r.results || []);
      rows.push(...result);
    }
    return rows.map((row) => ({
      contextDocumentId: row.context_document_id,
      sourceDocumentId: row.source_document_id,
    }));
  }

  public async markDocumentsDeletedByVectorIds(applicationId: string, userEmail: string, vectorIds: string[]): Promise<void> {
    if (vectorIds.length === 0) return;
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    for (const chunk of ApplicationContextDocumentQueries.chunk(vectorIds, 100)) {
      const placeholders: string = chunk.map((): string => '?').join(', ');
      await executeD1WithRetry(
        (): Promise<D1Result> =>
          this.database
            .prepare(
              `
                UPDATE application_context_documents
                SET status = ?, deleted_at = ?, updated_at = ?
                WHERE application_id = ? AND user_email = ? AND vector_id IN (${placeholders})
              `,
            )
            .bind(APPLICATION_CONTEXT_DOCUMENT_STATUS_DELETED, now, now, applicationId, userEmail, ...chunk)
            .run(),
        'mark context documents deleted',
      );
    }
  }

  public async listApplicationsOverDocumentLimit(globalMax: number): Promise<OverLimitApplication[]> {
    const rows = await this.database
      .prepare(
        `
          SELECT
            ca.application_id,
            ca.user_email,
            COUNT(acd.context_document_id) AS active_count,
            COALESCE(ca.max_context_documents, ?) AS effective_limit
          FROM connected_applications ca
          JOIN application_context_documents acd
            ON acd.application_id = ca.application_id
            AND acd.status = ?
          GROUP BY ca.application_id, ca.user_email, ca.max_context_documents
          HAVING COUNT(acd.context_document_id) > COALESCE(ca.max_context_documents, ?)
        `,
      )
      .bind(globalMax, APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE, globalMax)
      .all<{ application_id: string; user_email: string; active_count: number; effective_limit: number }>()
      .then((r) => r.results || []);
    return rows.map((r) => ({
      applicationId: r.application_id,
      userEmail: r.user_email,
      activeCount: r.active_count,
      effectiveLimit: r.effective_limit,
    }));
  }

  public async getCountsByUserEmail(userEmail: string, applicationId?: string): Promise<ApplicationContextUserCounts> {
    const conditions: string[] = ['user_email = ?'];
    const bindings: Array<string | number> = [userEmail];
    if (applicationId) {
      conditions.push('application_id = ?');
      bindings.push(applicationId);
    }
    const where: string = conditions.join(' AND ');

    const row: { active: number; deleted: number; error: number; total_chars: number } | null = await this.database
      .prepare(
        `
          SELECT SUM(CASE WHEN status = 'active'  THEN 1 ELSE 0 END) AS active,
                 SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) AS deleted,
                 SUM(CASE WHEN status = 'error'   THEN 1 ELSE 0 END) AS error,
                 SUM(CASE WHEN status = 'active'  THEN indexed_text_chars ELSE 0 END) AS total_chars
          FROM application_context_documents
          WHERE ${where}
        `,
      )
      .bind(...bindings)
      .first<{ active: number; deleted: number; error: number; total_chars: number }>();

    return {
      active: row?.active ?? 0,
      deleted: row?.deleted ?? 0,
      error: row?.error ?? 0,
      totalCharsIndexed: row?.total_chars ?? 0,
    };
  }

  private static chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }
}

interface OverLimitApplication {
  applicationId: string;
  userEmail: string;
  activeCount: number;
  effectiveLimit: number;
}

interface ApplicationContextUserCounts {
  active: number;
  deleted: number;
  error: number;
  totalCharsIndexed: number;
}

export { ApplicationContextDocumentQueries };
export type { ApplicationContextUserCounts, OverLimitApplication };
