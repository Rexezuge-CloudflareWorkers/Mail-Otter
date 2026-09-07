import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContextAuditLog } from '../types';
import { fetchDocumentAuditLogs } from '../services/userService';

interface UseAuditLogsOptions {
  showNotice: (type: 'success' | 'error', text: string) => void;
}

export function useAuditLogs({ showNotice }: UseAuditLogsOptions) {
  const { t } = useTranslation();
  const [auditLogDocumentId, setAuditLogDocumentId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<ContextAuditLog[]>([]);
  const [auditLogsCursor, setAuditLogsCursor] = useState<string | undefined>();
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  const openAuditLogs = async (contextDocumentId: string) => {
    setAuditLogDocumentId(contextDocumentId);
    setAuditLogs([]);
    setAuditLogsCursor(undefined);
    setLoadingAuditLogs(true);
    try {
      const data = await fetchDocumentAuditLogs(contextDocumentId);
      setAuditLogs(data.logs);
      setAuditLogsCursor(data.nextCursor ?? undefined);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.auditLogsLoadFailed', 'Unable To Load Audit Logs.'));
      setAuditLogDocumentId(null);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  const closeAuditLogs = () => {
    setAuditLogDocumentId(null);
    setAuditLogs([]);
    setAuditLogsCursor(undefined);
  };

  const loadMoreAuditLogs = async () => {
    if (!auditLogDocumentId || !auditLogsCursor || loadingAuditLogs) return;
    setLoadingAuditLogs(true);
    try {
      const data = await fetchDocumentAuditLogs(auditLogDocumentId, auditLogsCursor);
      setAuditLogs((p) => [...p, ...data.logs]);
      setAuditLogsCursor(data.nextCursor ?? undefined);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.auditLogsMoreFailed', 'Unable To Load More Audit Logs.'));
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  const refreshAuditLogs = useCallback(async () => {
    if (!auditLogDocumentId) return;
    setLoadingAuditLogs(true);
    try {
      const data = await fetchDocumentAuditLogs(auditLogDocumentId);
      setAuditLogs(data.logs);
      setAuditLogsCursor(data.nextCursor ?? undefined);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.auditLogsRefreshFailed', 'Unable To Refresh Audit Logs.'));
    } finally {
      setLoadingAuditLogs(false);
    }
  }, [auditLogDocumentId, showNotice, t]);

  return {
    auditLogDocumentId,
    auditLogs,
    auditLogsCursor,
    loadingAuditLogs,
    openAuditLogs,
    closeAuditLogs,
    loadMoreAuditLogs,
    refreshAuditLogs,
  };
}
