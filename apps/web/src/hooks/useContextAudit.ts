import { useState } from 'react';
import type { ApplicationContextDocument, ApplicationContextDeletionRun, ApplicationContextDocumentStatus } from '../../components/types';
import * as contextSvc from '../services/contextService';

interface UseContextAuditOptions {
  showNotice: (type: 'success' | 'error', text: string) => void;
}

export function useContextAudit({ showNotice }: UseContextAuditOptions) {
  const [auditApplicationId, setAuditApplicationId] = useState('');
  const [auditStatus, setAuditStatus] = useState<ApplicationContextDocumentStatus | ''>('');
  const [contextDocuments, setContextDocuments] = useState<ApplicationContextDocument[]>([]);
  const [contextDocumentsCursor, setContextDocumentsCursor] = useState<string | undefined>();
  const [contextDeletionRuns, setContextDeletionRuns] = useState<ApplicationContextDeletionRun[]>([]);
  const [contextDeletionRunsCursor, setContextDeletionRunsCursor] = useState<string | undefined>();

  const loadContextAudit = async () => {
    try {
      const data = await contextSvc.loadContextAudit(auditApplicationId, auditStatus);
      setContextDocuments(data.documents);
      setContextDocumentsCursor(data.documentsCursor);
      setContextDeletionRuns(data.deletionRuns);
      setContextDeletionRunsCursor(data.deletionRunsCursor);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load Context.');
    }
  };

  const loadMoreContextDocuments = async () => {
    if (!contextDocumentsCursor) return;
    try {
      const data = await contextSvc.loadMoreDocuments(auditApplicationId, auditStatus, contextDocumentsCursor);
      setContextDocuments((c) => [...c, ...data.documents]);
      setContextDocumentsCursor(data.nextCursor);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load More Documents.');
    }
  };

  const loadMoreContextDeletions = async () => {
    if (!contextDeletionRunsCursor) return;
    try {
      const data = await contextSvc.loadMoreDeletions(auditApplicationId, contextDeletionRunsCursor);
      setContextDeletionRuns((c) => [...c, ...data.deletionRuns]);
      setContextDeletionRunsCursor(data.nextCursor);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load More Deletions.');
    }
  };

  const openContextDocumentInProvider = async (contextDocumentId: string) => {
    try {
      const data = await contextSvc.openContextDocumentInProvider(contextDocumentId);
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Open Provider Document.');
    }
  };

  return {
    auditApplicationId,
    setAuditApplicationId,
    auditStatus,
    setAuditStatus,
    contextDocuments,
    contextDeletionRuns,
    contextDocumentsCursor,
    contextDeletionRunsCursor,
    loadContextAudit,
    loadMoreContextDocuments,
    loadMoreContextDeletions,
    openContextDocumentInProvider,
  };
}
