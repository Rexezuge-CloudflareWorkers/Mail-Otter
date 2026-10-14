import { APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE, APPLICATION_CONTEXT_DOCUMENT_STATUS_DELETED } from '@mail-otter/shared/constants';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';
import { userScopeSql } from './userScope';
import type { UserScope, UserScopeSql } from './userScope';

// Vector/limit query concerns extracted from ApplicationContextDAO god-file.
// ApplicationContextDAO delegates to this helper (composition) to keep public
// signatures stable while reducing the facade size.
class ApplicationContextDocumentQueries extends BaseDAO {
  public async listActiveVectorIdsForApplication(applicationId: string, scope: UserScope): Promise<string[]> {
    const where: UserScopeSql = userScopeSql(scope);
    const rows: Array<{ vector_id: string }> = await this.all<{ vector_id: string }>(
      ` SELECT vector_id FROM application_context_documents WHERE application_id = ? AND ${where.clause} AND status = ? `,
      [applicationId, ...where.bindings, APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE],
    );
    return rows.map((row: { vector_id: string }): string => row.vector_id);
  }

  public async listOldestActiveVectorIdsForApplication(applicationId: string, scope: UserScope, count: number): Promise<string[]> {
    const where: UserScopeSql = userScopeSql(scope);
    const rows = await this.all<{ vector_id: string }>(
      ` SELECT vector_id FROM application_context_documents WHERE application_id = ? AND ${where.clause} AND status = ? ORDER BY created_at ASC LIMIT ? `,
      [applicationId, ...where.bindings, APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE, count],
    );
    return rows.map((r) => r.vector_id);
  }

  public async getDocumentSourcesByVectorIds(
    applicationId: string,
    scope: UserScope,
    vectorIds: string[],
  ): Promise<Array<{ contextDocumentId: string; sourceDocumentId: string | null }>> {
    if (vectorIds.length === 0) return [];
    const where: UserScopeSql = userScopeSql(scope);
    const rows: Array<{ context_document_id: string; source_document_id: string | null }> = [];
    for (const chunk of ApplicationContextDocumentQueries.chunk(vectorIds, 100)) {
      const placeholders: string = chunk.map((): string => '?').join(', ');
      const result: Array<{ context_document_id: string; source_document_id: string | null }> = await this.all<{
        context_document_id: string;
        source_document_id: string | null;
      }>(
        ` SELECT context_document_id, source_document_id FROM application_context_documents WHERE application_id = ? AND ${where.clause} AND vector_id IN (${placeholders}) `,
        [applicationId, ...where.bindings, ...chunk],
      );
      rows.push(...result);
    }
    return rows.map((row) => ({
      contextDocumentId: row.context_document_id,
      sourceDocumentId: row.source_document_id,
    }));
  }

  public async markDocumentsDeletedByVectorIds(applicationId: string, scope: UserScope, vectorIds: string[]): Promise<void> {
    if (vectorIds.length === 0) return;
    const where: UserScopeSql = userScopeSql(scope);
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    for (const chunk of ApplicationContextDocumentQueries.chunk(vectorIds, 100)) {
      const placeholders: string = chunk.map((): string => '?').join(', ');
      await this.run(
        ` UPDATE application_context_documents SET status = ?, deleted_at = ?, updated_at = ? WHERE application_id = ? AND ${where.clause} AND vector_id IN (${placeholders}) `,
        [APPLICATION_CONTEXT_DOCUMENT_STATUS_DELETED, now, now, applicationId, ...where.bindings, ...chunk],
      );
    }
  }

  public async listApplicationsOverDocumentLimit(globalMax: number): Promise<OverLimitApplication[]> {
    const rows = await this.all<{
      application_id: string;
      user_email: string;
      user_id: string | null;
      active_count: number;
      effective_limit: number;
    }>(
      ` SELECT ca.application_id, ca.user_email, ca.user_id, COUNT(acd.context_document_id) AS active_count, COALESCE(ca.max_context_documents, ?) AS effective_limit FROM connected_applications ca JOIN application_context_documents acd ON acd.application_id = ca.application_id AND acd.status = ? GROUP BY ca.application_id, ca.user_email, ca.user_id, ca.max_context_documents HAVING COUNT(acd.context_document_id) > COALESCE(ca.max_context_documents, ?) `,
      [globalMax, APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE, globalMax],
    );
    return rows.map((r) => ({
      applicationId: r.application_id,
      // `user_email` is the frozen anchor, `userId` the account it belongs to.
      userEmail: r.user_email,
      userId: r.user_id ?? null,
      activeCount: r.active_count,
      effectiveLimit: r.effective_limit,
    }));
  }

  public async getCountsByUserScope(scope: UserScope, applicationId?: string): Promise<ApplicationContextUserCounts> {
    const userWhere: UserScopeSql = userScopeSql(scope);
    const conditions: string[] = [userWhere.clause];
    const bindings: Array<string | number> = [...userWhere.bindings];
    if (applicationId) {
      conditions.push('application_id = ?');
      bindings.push(applicationId);
    }
    const where: string = conditions.join(' AND ');

    const row: { active: number; deleted: number; error: number; total_chars: number } | null = await this.first<{
      active: number;
      deleted: number;
      error: number;
      total_chars: number;
    }>(
      ` SELECT SUM(CASE WHEN status = 'active'  THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) AS deleted, SUM(CASE WHEN status = 'error'   THEN 1 ELSE 0 END) AS error, SUM(CASE WHEN status = 'active'  THEN indexed_text_chars ELSE 0 END) AS total_chars FROM application_context_documents WHERE ${where} `,
      [...bindings],
    );

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
  /**
  The owner's frozen anchor.
  */
  userEmail: string;
  /**
  The owning account, or null when the application predates the id backfill.
  */
  userId: string | null;
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
