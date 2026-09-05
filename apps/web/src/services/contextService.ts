import type { ApplicationContextDocument, ApplicationContextDeletionRun, ApplicationContextDocumentStatus } from '../types';
import { apiGet } from '../lib/api';

export async function loadContextAudit(
  applicationId: string,
  status: ApplicationContextDocumentStatus | '',
): Promise<{
  documents: ApplicationContextDocument[];
  documentsCursor?: string;
  deletionRuns: ApplicationContextDeletionRun[];
  deletionRunsCursor?: string;
}> {
  const base = applicationId ? { applicationId } : {};
  const [docData, delData] = await Promise.all([
    apiGet<{ documents: ApplicationContextDocument[]; nextCursor?: string }>(
      '/user/application/context/documents',
      status ? { ...base, status } : base,
    ),
    apiGet<{ deletionRuns: ApplicationContextDeletionRun[]; nextCursor?: string }>(
      '/user/application/context/deletions',
      base,
    ),
  ]);
  return {
    documents: docData.documents,
    documentsCursor: docData.nextCursor,
    deletionRuns: delData.deletionRuns,
    deletionRunsCursor: delData.nextCursor,
  };
}

async function loadContextPage<T>(path: string, applicationId: string, extra: Record<string, string | undefined>, cursor: string): Promise<T> {
  return apiGet<T>(path, { ...extra, ...(applicationId && { applicationId }), cursor });
}

export async function loadMoreDocuments(
  applicationId: string,
  status: ApplicationContextDocumentStatus | '',
  cursor: string,
): Promise<{ documents: ApplicationContextDocument[]; nextCursor?: string }> {
  return loadContextPage<{ documents: ApplicationContextDocument[]; nextCursor?: string }>(
    '/user/application/context/documents',
    applicationId,
    status ? { status } : {},
    cursor,
  );
}

export async function loadMoreDeletions(
  applicationId: string,
  cursor: string,
): Promise<{ deletionRuns: ApplicationContextDeletionRun[]; nextCursor?: string }> {
  return loadContextPage<{ deletionRuns: ApplicationContextDeletionRun[]; nextCursor?: string }>(
    '/user/application/context/deletions',
    applicationId,
    {},
    cursor,
  );
}

export async function openContextDocumentInProvider(contextDocumentId: string): Promise<{ url: string }> {
  return apiGet<{ url: string }>(
    `/user/application/context/document/${encodeURIComponent(contextDocumentId)}/provider-link`,
  );
}
