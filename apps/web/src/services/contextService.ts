import type { ApplicationContextDocument, ApplicationContextDeletionRun, ApplicationContextDocumentStatus } from '../../components/types';
import { apiFetch, readJson } from '../../components/utils';

export async function loadContextAudit(
  applicationId: string,
  status: ApplicationContextDocumentStatus | '',
): Promise<{
  documents: ApplicationContextDocument[];
  documentsCursor?: string;
  deletionRuns: ApplicationContextDeletionRun[];
  deletionRunsCursor?: string;
}> {
  const dp = new URLSearchParams();
  const xp = new URLSearchParams();
  if (applicationId) { dp.set('applicationId', applicationId); xp.set('applicationId', applicationId); }
  if (status) dp.set('status', status);
  const [docData, delData] = await Promise.all([
    readJson<{ documents: ApplicationContextDocument[]; nextCursor?: string }>(await apiFetch(`/user/application/context/documents?${dp}`)),
    readJson<{ deletionRuns: ApplicationContextDeletionRun[]; nextCursor?: string }>(await apiFetch(`/user/application/context/deletions?${xp}`)),
  ]);
  return {
    documents: docData.documents,
    documentsCursor: docData.nextCursor,
    deletionRuns: delData.deletionRuns,
    deletionRunsCursor: delData.nextCursor,
  };
}

export async function loadMoreDocuments(
  applicationId: string,
  status: ApplicationContextDocumentStatus | '',
  cursor: string,
): Promise<{ documents: ApplicationContextDocument[]; nextCursor?: string }> {
  const p = new URLSearchParams();
  if (applicationId) p.set('applicationId', applicationId);
  if (status) p.set('status', status);
  p.set('cursor', cursor);
  return readJson<{ documents: ApplicationContextDocument[]; nextCursor?: string }>(
    await apiFetch(`/user/application/context/documents?${p}`),
  );
}

export async function loadMoreDeletions(
  applicationId: string,
  cursor: string,
): Promise<{ deletionRuns: ApplicationContextDeletionRun[]; nextCursor?: string }> {
  const p = new URLSearchParams();
  if (applicationId) p.set('applicationId', applicationId);
  p.set('cursor', cursor);
  return readJson<{ deletionRuns: ApplicationContextDeletionRun[]; nextCursor?: string }>(
    await apiFetch(`/user/application/context/deletions?${p}`),
  );
}

export async function openContextDocumentInProvider(contextDocumentId: string): Promise<{ url: string }> {
  return readJson<{ url: string }>(
    await apiFetch(`/user/application/context/document/${encodeURIComponent(contextDocumentId)}/provider-link`),
  );
}
