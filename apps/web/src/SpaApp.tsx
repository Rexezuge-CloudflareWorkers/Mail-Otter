import { useCallback, useEffect, useMemo, useState } from 'react';
import Unauthorized from '../components/Unauthorized';
import type {
  ApplicationContextDeletionRun,
  ApplicationContextDocument,
  ApplicationContextDocumentStatus,
  ConnectedApplication,
  ContextAuditLog,
  CurrentUser,
  EmailAction,
  EmailActionExecution,
  EmailActionStatus,
  SenderDomainFilters,
} from '../components/types';
import { apiFetch, fetchDocumentAuditLogs, readJson, providerMethod } from '../components/utils';
import type { ActiveView } from './types';
import { Header } from './components/layout/Header';
import { NoticeBar } from './components/layout/NoticeBar';
import { MailboxesView } from './components/views/MailboxesView';
import { ContextAuditView } from './components/views/ContextAuditView';
import { ActionsView } from './components/views/ActionsView';
import { ConfirmDeleteModal } from './components/modals/ConfirmDeleteModal';
import { AuditLogsModal } from './components/modals/AuditLogsModal';
import type { ApplicationFormState } from './components/mailboxes/MailboxForm';
import { emptyForm } from './components/mailboxes/MailboxForm';

function getInitialNotice(): { type: 'success' | 'error'; text: string } | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('oauth2') === 'connected') return { type: 'success', text: 'OAuth2 Connection Completed.' };
  if (params.get('oauth2') === 'error') return { type: 'error', text: params.get('message') || 'OAuth2 Connection Failed.' };
  return null;
}

export default function SpaApp() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [applications, setApplications] = useState<ConnectedApplication[]>([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState('');
  const [applicationForm, setApplicationForm] = useState<ApplicationFormState>(emptyForm);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(() => getInitialNotice());
  const [isBusy, setIsBusy] = useState(false);
  const [watchWebhookUrl, setWatchWebhookUrl] = useState('');
  const [activeView, setActiveView] = useState<ActiveView>('mailboxes');

  // Context audit state
  const [auditApplicationId, setAuditApplicationId] = useState('');
  const [auditStatus, setAuditStatus] = useState<ApplicationContextDocumentStatus | ''>('');
  const [contextDocuments, setContextDocuments] = useState<ApplicationContextDocument[]>([]);
  const [contextDocumentsCursor, setContextDocumentsCursor] = useState<string | undefined>();
  const [contextDeletionRuns, setContextDeletionRuns] = useState<ApplicationContextDeletionRun[]>([]);
  const [contextDeletionRunsCursor, setContextDeletionRunsCursor] = useState<string | undefined>();

  // Actions state
  const [actions, setActions] = useState<EmailAction[]>([]);
  const [actionsCursor, setActionsCursor] = useState<string | undefined>();
  const [actionApplicationId, setActionApplicationId] = useState('');
  const [actionStatus, setActionStatus] = useState<EmailActionStatus | ''>('');
  const [actionExecutions, setActionExecutions] = useState<EmailActionExecution[]>([]);
  const [selectedActionId, setSelectedActionId] = useState('');

  // Folders & modals
  const [availableFolders, setAvailableFolders] = useState<Array<{ id: string; name: string }> | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ applicationId: string; displayName: string } | null>(null);
  const [auditLogDocumentId, setAuditLogDocumentId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<ContextAuditLog[]>([]);
  const [auditLogsCursor, setAuditLogsCursor] = useState<string | undefined>();
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  useEffect(() => {
    setAvailableFolders(null);
    setLoadingFolders(false);
  }, [selectedApplicationId]);

  const showNotice = useCallback((type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 6000);
  }, []);

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadApplications = useCallback(async () => {
    const data = await readJson<{ applications: ConnectedApplication[] }>(await apiFetch('/user/applications'));
    setApplications(data.applications);
    setSelectedApplicationId((c) => c || data.applications[0]?.applicationId || '');
  }, []);

  const loadContextAudit = useCallback(async () => {
    const dp = new URLSearchParams();
    const xp = new URLSearchParams();
    if (auditApplicationId) { dp.set('applicationId', auditApplicationId); xp.set('applicationId', auditApplicationId); }
    if (auditStatus) dp.set('status', auditStatus);
    const [docData, delData] = await Promise.all([
      readJson<{ documents: ApplicationContextDocument[]; nextCursor?: string }>(await apiFetch(`/user/application/context/documents?${dp}`)),
      readJson<{ deletionRuns: ApplicationContextDeletionRun[]; nextCursor?: string }>(await apiFetch(`/user/application/context/deletions?${xp}`)),
    ]);
    setContextDocuments(docData.documents);
    setContextDocumentsCursor(docData.nextCursor);
    setContextDeletionRuns(delData.deletionRuns);
    setContextDeletionRunsCursor(delData.nextCursor);
  }, [auditApplicationId, auditStatus]);

  const loadActions = useCallback(async (append = false, cursor?: string) => {
    const p = new URLSearchParams();
    if (actionApplicationId) p.set('applicationId', actionApplicationId);
    if (actionStatus) p.set('status', actionStatus);
    if (cursor) p.set('cursor', cursor);
    const data = await readJson<{ actions: EmailAction[]; nextCursor?: string }>(await apiFetch(`/user/actions?${p}`));
    setActions((c) => (append ? [...c, ...data.actions] : data.actions));
    setActionsCursor(data.nextCursor);
    setSelectedActionId((c) => c || data.actions[0]?.actionId || '');
  }, [actionApplicationId, actionStatus]);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await readJson<CurrentUser>(await apiFetch('/user/me'));
        setUser(me);
        setAuthorized(true);
        await loadApplications();
      } catch {
        setAuthorized(false);
      }
    };
    load();
  }, [loadApplications]);

  useEffect(() => {
    if (authorized && activeView === 'context') {
      loadContextAudit().catch((e: unknown) => showNotice('error', e instanceof Error ? e.message : 'Unable To Load Context.'));
    }
  }, [activeView, authorized, loadContextAudit, showNotice]);

  useEffect(() => {
    if (authorized && activeView === 'actions') {
      loadActions().catch((e: unknown) => showNotice('error', e instanceof Error ? e.message : 'Unable To Load Actions.'));
    }
  }, [activeView, authorized, loadActions, showNotice]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const resetForm = () => {
    setApplicationForm(emptyForm);
    setIsFormExpanded(false);
  };

  const editApplication = (app: ConnectedApplication) => {
    setApplicationForm({
      applicationId: app.applicationId,
      displayName: app.displayName,
      providerId: app.providerId,
      clientId: '',
      clientSecret: '',
      gmailPubsubTopicName: app.gmailPubsubTopicName || '',
      enabledFeatures: app.enabledFeatures || [],
    });
    setIsFormExpanded(true);
  };

  const saveApplication = async () => {
    setIsBusy(true);
    try {
      const payload = {
        applicationId: applicationForm.applicationId,
        displayName: applicationForm.displayName,
        providerId: applicationForm.providerId,
        connectionMethod: providerMethod[applicationForm.providerId],
        ...(applicationForm.clientId ? { clientId: applicationForm.clientId } : {}),
        ...(applicationForm.clientSecret ? { clientSecret: applicationForm.clientSecret } : {}),
        enabledFeatures: applicationForm.enabledFeatures,
        ...(applicationForm.providerId === 'google-gmail' ? { gmailPubsubTopicName: applicationForm.gmailPubsubTopicName } : {}),
      };
      const res = await apiFetch('/user/application', {
        method: applicationForm.applicationId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJson<{ application: ConnectedApplication }>(res);
      showNotice('success', applicationForm.applicationId ? 'Mailbox Updated.' : 'Mailbox Created.');
      resetForm();
      await loadApplications();
      setSelectedApplicationId(data.application.applicationId);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Save Mailbox.');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteApplication = async (applicationId: string) => {
    setIsBusy(true);
    try {
      await readJson<{ success: boolean }>(
        await apiFetch('/user/application', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId }),
        }),
      );
      showNotice('success', 'Mailbox Deleted.');
      setSelectedApplicationId('');
      setWatchWebhookUrl('');
      await loadApplications();
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Delete Mailbox.');
    } finally {
      setIsBusy(false);
    }
  };

  const startOAuth2 = async (applicationId: string) => {
    setIsBusy(true);
    try {
      const data = await readJson<{ authorizationUrl: string }>(
        await apiFetch('/user/application/oauth2/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId }),
        }),
      );
      window.location.assign(data.authorizationUrl);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Start OAuth2.');
      setIsBusy(false);
    }
  };

  const startWatch = async (applicationId: string) => {
    setIsBusy(true);
    try {
      const data = await readJson<{ message: string; webhookUrl: string }>(
        await apiFetch('/user/application/watch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId }),
        }),
      );
      setWatchWebhookUrl(data.webhookUrl);
      await loadApplications();
      showNotice('success', data.message);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Start Watch.');
    } finally {
      setIsBusy(false);
    }
  };

  const stopWatch = async (applicationId: string) => {
    setIsBusy(true);
    try {
      const data = await readJson<{ message: string }>(
        await apiFetch('/user/application/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId }),
        }),
      );
      setWatchWebhookUrl('');
      await loadApplications();
      showNotice('success', data.message);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Stop Watch.');
    } finally {
      setIsBusy(false);
    }
  };

  const updateContextIndexing = async (applicationId: string, contextIndexingEnabled: boolean) => {
    setIsBusy(true);
    try {
      const data = await readJson<{ application: ConnectedApplication }>(
        await apiFetch('/user/application/context', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId, contextIndexingEnabled }),
        }),
      );
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
      showNotice('success', contextIndexingEnabled ? 'Context Indexing Enabled.' : 'Context Indexing Disabled.');
      if (activeView === 'context') await loadContextAudit();
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Update Context Setting.');
    } finally {
      setIsBusy(false);
    }
  };

  const updateMaxContextDocuments = async (applicationId: string, maxContextDocuments: number | null) => {
    setIsBusy(true);
    try {
      const data = await readJson<{ application: ConnectedApplication }>(
        await apiFetch('/user/application/context', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId, maxContextDocuments }),
        }),
      );
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
      showNotice('success', maxContextDocuments != null ? `Document Limit Set To ${maxContextDocuments}.` : 'Document Limit Reset.');
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Update Document Limit.');
    } finally {
      setIsBusy(false);
    }
  };

  const loadFolders = async (applicationId: string) => {
    setLoadingFolders(true);
    try {
      const data = await readJson<{ folders: Array<{ id: string; name: string }> }>(
        await apiFetch(`/user/application/folders?applicationId=${encodeURIComponent(applicationId)}`),
      );
      setAvailableFolders(data.folders);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load Folders.');
    } finally {
      setLoadingFolders(false);
    }
  };

  const updateWatchedFolderIds = async (applicationId: string, folderIds: string[] | null) => {
    setIsBusy(true);
    try {
      const folderNames: Record<string, string> = {};
      if (folderIds && availableFolders) {
        for (const id of folderIds) {
          const folder = availableFolders.find((f) => f.id === id);
          if (folder) folderNames[id] = folder.name;
        }
      }
      const data = await readJson<{ application: ConnectedApplication }>(
        await apiFetch('/user/application/watch-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId, folderIds, folderNames }),
        }),
      );
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Update Watch Folders.');
    } finally {
      setIsBusy(false);
    }
  };

  const updateSenderFilters = async (applicationId: string, filters: SenderDomainFilters) => {
    const app = applications.find((a) => a.applicationId === applicationId);
    if (!app) return;
    setIsBusy(true);
    try {
      const data = await readJson<{ application: ConnectedApplication }>(
        await apiFetch('/user/application', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applicationId: app.applicationId,
            displayName: app.displayName,
            providerId: app.providerId,
            connectionMethod: providerMethod[app.providerId],
            enabledFeatures: app.enabledFeatures,
            ...(app.providerId === 'google-gmail' ? { gmailPubsubTopicName: app.gmailPubsubTopicName } : {}),
            senderDomainFilters: filters,
          }),
        }),
      );
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
      showNotice('success', 'Sender Filter Rules Updated.');
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Update Sender Filters.');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteContextDocuments = async (applicationId: string) => {
    const app = applications.find((a) => a.applicationId === applicationId);
    if (!window.confirm(`Delete All Indexed Documents For ${app?.displayName || 'This Mailbox'}?`)) return;
    setIsBusy(true);
    try {
      const data = await readJson<{ deletionRun: ApplicationContextDeletionRun }>(
        await apiFetch('/user/application/context/delete-documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId }),
        }),
      );
      await loadApplications();
      if (activeView === 'context') await loadContextAudit();
      showNotice(
        data.deletionRun.status === 'accepted' ? 'success' : 'error',
        data.deletionRun.status === 'accepted' ? 'Context Documents Deletion Accepted.' : data.deletionRun.errorMessage || 'Context Deletion Failed.',
      );
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Delete Context Documents.');
    } finally {
      setIsBusy(false);
    }
  };

  const dismissError = async (applicationId: string, errorType: 'processing' | 'context') => {
    setIsBusy(true);
    try {
      const data = await readJson<{ application: ConnectedApplication }>(
        await apiFetch('/user/application/dismiss-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId, errorType }),
        }),
      );
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Dismiss Error.');
    } finally {
      setIsBusy(false);
    }
  };

  const loadMoreContextDocuments = async () => {
    if (!contextDocumentsCursor) return;
    const p = new URLSearchParams();
    if (auditApplicationId) p.set('applicationId', auditApplicationId);
    if (auditStatus) p.set('status', auditStatus);
    p.set('cursor', contextDocumentsCursor);
    const data = await readJson<{ documents: ApplicationContextDocument[]; nextCursor?: string }>(
      await apiFetch(`/user/application/context/documents?${p}`),
    );
    setContextDocuments((c) => [...c, ...data.documents]);
    setContextDocumentsCursor(data.nextCursor);
  };

  const loadMoreContextDeletions = async () => {
    if (!contextDeletionRunsCursor) return;
    const p = new URLSearchParams();
    if (auditApplicationId) p.set('applicationId', auditApplicationId);
    p.set('cursor', contextDeletionRunsCursor);
    const data = await readJson<{ deletionRuns: ApplicationContextDeletionRun[]; nextCursor?: string }>(
      await apiFetch(`/user/application/context/deletions?${p}`),
    );
    setContextDeletionRuns((c) => [...c, ...data.deletionRuns]);
    setContextDeletionRunsCursor(data.nextCursor);
  };

  const loadActionExecutions = async (actionId: string) => {
    setSelectedActionId(actionId);
    try {
      const data = await readJson<{ executions: EmailActionExecution[] }>(
        await apiFetch(`/user/actions/${encodeURIComponent(actionId)}/executions`),
      );
      setActionExecutions(data.executions);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load Action Audit.');
    }
  };

  const executeAction = async (actionId: string) => {
    setIsBusy(true);
    try {
      const data = await readJson<{ action: EmailAction }>(
        await apiFetch(`/user/actions/${encodeURIComponent(actionId)}/execute`, { method: 'POST' }),
      );
      setActions((c) => c.map((a) => (a.actionId === data.action.actionId ? data.action : a)));
      await loadActionExecutions(actionId);
      showNotice(data.action.status === 'succeeded' ? 'success' : 'error', data.action.result?.summary || data.action.errorMessage || data.action.status);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Execute Action.');
    } finally {
      setIsBusy(false);
    }
  };

  const openContextDocumentInProvider = async (contextDocumentId: string) => {
    try {
      const data = await readJson<{ url: string }>(
        await apiFetch(`/user/application/context/document/${encodeURIComponent(contextDocumentId)}/provider-link`),
      );
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Open Provider Document.');
    }
  };

  const viewDocumentAuditLogs = async (contextDocumentId: string) => {
    setAuditLogDocumentId(contextDocumentId);
    setAuditLogs([]);
    setAuditLogsCursor(undefined);
    setLoadingAuditLogs(true);
    try {
      const data = await fetchDocumentAuditLogs(contextDocumentId);
      setAuditLogs(data.logs);
      setAuditLogsCursor(data.nextCursor ?? undefined);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load Audit Logs.');
      setAuditLogDocumentId(null);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  const loadMoreAuditLogs = async () => {
    if (!auditLogDocumentId || !auditLogsCursor || loadingAuditLogs) return;
    setLoadingAuditLogs(true);
    try {
      const data = await fetchDocumentAuditLogs(auditLogDocumentId, auditLogsCursor);
      setAuditLogs((p) => [...p, ...data.logs]);
      setAuditLogsCursor(data.nextCursor ?? undefined);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load More Audit Logs.');
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
      showNotice('error', e instanceof Error ? e.message : 'Unable To Refresh Audit Logs.');
    } finally {
      setLoadingAuditLogs(false);
    }
  }, [auditLogDocumentId, showNotice]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedApplication = useMemo(
    () => applications.find((a) => a.applicationId === selectedApplicationId),
    [applications, selectedApplicationId],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-base)] flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!authorized || !user) return <Unauthorized />;

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] text-[var(--color-text-primary)]">
      <Header activeView={activeView} onViewChange={setActiveView} userEmail={user.email} aiUsage={user.aiUsage} />

      {notice && <NoticeBar notice={notice} />}

      {activeView === 'mailboxes' && (
        <MailboxesView
          applications={applications}
          selectedApplicationId={selectedApplicationId}
          onSelectApplication={setSelectedApplicationId}
          user={user}
          watchWebhookUrl={watchWebhookUrl}
          availableFolders={availableFolders}
          loadingFolders={loadingFolders}
          busy={isBusy}
          applicationForm={applicationForm}
          setApplicationForm={setApplicationForm}
          onSaveForm={saveApplication}
          onCancelForm={resetForm}
          onEditApplication={editApplication}
          onDeleteApplication={() => {
            if (selectedApplication) {
              setConfirmDelete({ applicationId: selectedApplication.applicationId, displayName: selectedApplication.displayName });
            }
          }}
          onStartOAuth2={startOAuth2}
          onStartWatch={startWatch}
          onStopWatch={stopWatch}
          onLoadFolders={loadFolders}
          onUpdateWatchedFolders={updateWatchedFolderIds}
          onUpdateSenderFilters={updateSenderFilters}
          onUpdateContextIndexing={updateContextIndexing}
          onUpdateMaxContextDocuments={updateMaxContextDocuments}
          onOpenContextAudit={(id) => { setAuditApplicationId(id); setActiveView('context'); }}
          onDeleteContextDocuments={deleteContextDocuments}
          onDismissProcessingError={(id) => dismissError(id, 'processing')}
          onDismissContextError={(id) => dismissError(id, 'context')}
          isFormExpanded={isFormExpanded}
          setIsFormExpanded={setIsFormExpanded}
        />
      )}

      {activeView === 'context' && (
        <ContextAuditView
          applications={applications}
          applicationId={auditApplicationId}
          setApplicationId={setAuditApplicationId}
          status={auditStatus}
          setStatus={setAuditStatus}
          documents={contextDocuments}
          deletionRuns={contextDeletionRuns}
          documentsCursor={contextDocumentsCursor}
          deletionRunsCursor={contextDeletionRunsCursor}
          onRefresh={loadContextAudit}
          onLoadMoreDocuments={loadMoreContextDocuments}
          onLoadMoreDeletions={loadMoreContextDeletions}
          onOpenProviderDocument={openContextDocumentInProvider}
          onViewLogs={viewDocumentAuditLogs}
          onToggleIndexing={updateContextIndexing}
          onDeleteDocuments={deleteContextDocuments}
          busy={isBusy}
        />
      )}

      {activeView === 'actions' && (
        <ActionsView
          applications={applications}
          applicationId={actionApplicationId}
          setApplicationId={setActionApplicationId}
          status={actionStatus}
          setStatus={setActionStatus}
          actions={actions}
          actionsCursor={actionsCursor}
          selectedActionId={selectedActionId}
          executions={actionExecutions}
          onRefresh={() => loadActions()}
          onLoadMore={() => loadActions(true, actionsCursor)}
          onSelectAction={loadActionExecutions}
          onExecuteAction={executeAction}
          busy={isBusy}
        />
      )}

      {confirmDelete && typeof document !== 'undefined' && (
        <ConfirmDeleteModal
          displayName={confirmDelete.displayName}
          onConfirm={() => {
            const { applicationId } = confirmDelete;
            setConfirmDelete(null);
            deleteApplication(applicationId);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {auditLogDocumentId && typeof document !== 'undefined' && (
        <AuditLogsModal
          logs={auditLogs}
          cursor={auditLogsCursor}
          loading={loadingAuditLogs}
          onClose={() => { setAuditLogDocumentId(null); setAuditLogs([]); setAuditLogsCursor(undefined); }}
          onLoadMore={loadMoreAuditLogs}
          onRefresh={refreshAuditLogs}
        />
      )}
    </div>
  );
}
