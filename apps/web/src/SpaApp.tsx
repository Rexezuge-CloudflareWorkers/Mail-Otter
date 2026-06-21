import { useEffect, useState } from 'react';
import Unauthorized from '../components/Unauthorized';
import type { ActiveView } from './types';
import { Header } from './components/layout/Header';
import { NoticeBar } from './components/layout/NoticeBar';
import { MailboxesView } from './components/views/MailboxesView';
import { ContextAuditView } from './components/views/ContextAuditView';
import { ActionsView } from './components/views/ActionsView';
import { ConfirmDeleteModal } from './components/modals/ConfirmDeleteModal';
import { AuditLogsModal } from './components/modals/AuditLogsModal';
import { NoticeContext } from './contexts/NoticeContext';
import { UserContext } from './contexts/UserContext';
import { MailboxCallbacksContext } from './contexts/MailboxCallbacksContext';
import { useNotice } from './hooks/useNotice';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useMailboxes } from './hooks/useMailboxes';
import { useContextAudit } from './hooks/useContextAudit';
import { useActions } from './hooks/useActions';
import { useAuditLogs } from './hooks/useAuditLogs';
import { getUrlParam, useSyncedUrl } from './hooks/useSyncedUrl';
import type { ApplicationContextDocumentStatus, EmailActionStatus } from '../components/types';

// Read URL params synchronously before first render so useState initializers can use them
const initialView = getUrlParam('view', 'mailboxes') as ActiveView;
const initialAppId = getUrlParam('appId', '');
const initialStatus = getUrlParam('status', '');
const initialActionId = getUrlParam('actionId', '');

export default function SpaApp() {
  const [activeView, setActiveView] = useState<ActiveView>(initialView);
  const [isBusy, setIsBusy] = useState(false);

  const { notice, showNotice } = useNotice();
  const { user, authorized } = useCurrentUser();
  const auditLogs = useAuditLogs({ showNotice });

  const contextAudit = useContextAudit({ showNotice });
  const actions = useActions({ setIsBusy, showNotice });

  const mailboxes = useMailboxes({
    setIsBusy,
    showNotice,
    onContextChanged: () => { contextAudit.loadContextAudit(); },
  });

  // Seed URL-provided values into their domains once on mount
  useEffect(() => {
    if (initialView === 'context' && initialAppId) contextAudit.setAuditApplicationId(initialAppId);
    if (initialView === 'context' && initialStatus) contextAudit.setAuditStatus(initialStatus as ApplicationContextDocumentStatus);
    if (initialView === 'actions' && initialAppId) actions.setActionApplicationId(initialAppId);
    if (initialView === 'actions' && initialStatus) actions.setActionStatus(initialStatus as EmailActionStatus);
    if (initialView === 'actions' && initialActionId) actions.setSelectedActionId(initialActionId);
    if (initialView === 'mailboxes' && initialAppId) mailboxes.setSelectedApplicationId(initialAppId);
  }, []);

  // Load applications once the user is authorized
  useEffect(() => {
    if (authorized) {
      mailboxes.loadApplications().catch(() => {});
    }
  }, [authorized]);

  // Load view-specific data when the active view becomes visible
  useEffect(() => {
    if (authorized && activeView === 'context') {
      contextAudit.loadContextAudit();
    }
  }, [activeView, authorized]);

  useEffect(() => {
    if (authorized && activeView === 'actions') {
      actions.loadActions();
    }
  }, [activeView, authorized]);

  // Sync current state back to the URL
  const effectiveAppId =
    activeView === 'mailboxes'
      ? mailboxes.selectedApplicationId
      : activeView === 'context'
        ? contextAudit.auditApplicationId
        : actions.actionApplicationId;

  useSyncedUrl({
    view: activeView,
    appId: effectiveAppId,
    status: activeView === 'context' ? contextAudit.auditStatus : activeView === 'actions' ? actions.actionStatus : '',
    actionId: activeView === 'actions' ? actions.selectedActionId : '',
  });

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-base)] flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!authorized || !user) return <Unauthorized />;

  // Mailbox callbacks object — stable per interaction (recreated when isBusy or selectedApplication change)
  const mailboxCallbacksValue = {
    busy: isBusy,
    onEdit: mailboxes.editApplication,
    onDelete: () => {
      if (mailboxes.selectedApplication) {
        mailboxes.setConfirmDelete({
          applicationId: mailboxes.selectedApplication.applicationId,
          displayName: mailboxes.selectedApplication.displayName,
        });
      }
    },
    onStartOAuth2: mailboxes.startOAuth2,
    onStartWatch: mailboxes.startWatch,
    onStopWatch: mailboxes.stopWatch,
    onLoadFolders: mailboxes.loadFolders,
    onUpdateWatchedFolders: mailboxes.updateWatchedFolderIds,
    onUpdateSenderFilters: mailboxes.updateSenderFilters,
    onUpdateContextIndexing: mailboxes.updateContextIndexing,
    onUpdateMaxContextDocuments: mailboxes.updateMaxContextDocuments,
    onOpenContextAudit: (id: string) => { contextAudit.setAuditApplicationId(id); setActiveView('context'); },
    onDeleteContextDocuments: mailboxes.deleteContextDocuments,
    onDismissProcessingError: (id: string) => mailboxes.dismissError(id, 'processing'),
    onDismissContextError: (id: string) => mailboxes.dismissError(id, 'context'),
  };

  return (
    <NoticeContext.Provider value={{ showNotice }}>
      <UserContext.Provider value={user}>
        <div className="min-h-screen bg-[var(--color-surface-base)] text-[var(--color-text-primary)]">
          <Header activeView={activeView} onViewChange={setActiveView} userEmail={user.email} aiUsage={user.aiUsage} />

          {notice && <NoticeBar notice={notice} />}

          <MailboxCallbacksContext.Provider value={mailboxCallbacksValue}>
            {activeView === 'mailboxes' && (
              <MailboxesView
                applications={mailboxes.applications}
                selectedApplicationId={mailboxes.selectedApplicationId}
                onSelectApplication={mailboxes.setSelectedApplicationId}
                watchWebhookUrl={mailboxes.watchWebhookUrl}
                availableFolders={mailboxes.availableFolders}
                loadingFolders={mailboxes.loadingFolders}
                applicationForm={mailboxes.applicationForm}
                setApplicationForm={mailboxes.setApplicationForm}
                onSaveForm={mailboxes.saveApplication}
                onCancelForm={mailboxes.resetForm}
                isFormExpanded={mailboxes.isFormExpanded}
                setIsFormExpanded={mailboxes.setIsFormExpanded}
              />
            )}
          </MailboxCallbacksContext.Provider>

          {activeView === 'context' && (
            <ContextAuditView
              applications={mailboxes.applications}
              applicationId={contextAudit.auditApplicationId}
              setApplicationId={contextAudit.setAuditApplicationId}
              status={contextAudit.auditStatus}
              setStatus={contextAudit.setAuditStatus}
              documents={contextAudit.contextDocuments}
              deletionRuns={contextAudit.contextDeletionRuns}
              documentsCursor={contextAudit.contextDocumentsCursor}
              deletionRunsCursor={contextAudit.contextDeletionRunsCursor}
              onRefresh={contextAudit.loadContextAudit}
              onLoadMoreDocuments={contextAudit.loadMoreContextDocuments}
              onLoadMoreDeletions={contextAudit.loadMoreContextDeletions}
              onOpenProviderDocument={contextAudit.openContextDocumentInProvider}
              onViewLogs={auditLogs.openAuditLogs}
              onToggleIndexing={mailboxes.updateContextIndexing}
              onDeleteDocuments={mailboxes.deleteContextDocuments}
              busy={isBusy}
            />
          )}

          {activeView === 'actions' && (
            <ActionsView
              applications={mailboxes.applications}
              applicationId={actions.actionApplicationId}
              setApplicationId={actions.setActionApplicationId}
              status={actions.actionStatus}
              setStatus={actions.setActionStatus}
              actions={actions.actions}
              actionsCursor={actions.actionsCursor}
              selectedActionId={actions.selectedActionId}
              executions={actions.actionExecutions}
              onRefresh={() => actions.loadActions()}
              onLoadMore={() => actions.loadActions(true, actions.actionsCursor)}
              onSelectAction={actions.loadActionExecutions}
              onExecuteAction={actions.executeAction}
              busy={isBusy}
            />
          )}

          {mailboxes.confirmDelete && typeof document !== 'undefined' && (
            <ConfirmDeleteModal
              displayName={mailboxes.confirmDelete.displayName}
              onConfirm={() => {
                const { applicationId } = mailboxes.confirmDelete!;
                mailboxes.setConfirmDelete(null);
                mailboxes.deleteApplication(applicationId);
              }}
              onCancel={() => mailboxes.setConfirmDelete(null)}
            />
          )}

          {auditLogs.auditLogDocumentId && typeof document !== 'undefined' && (
            <AuditLogsModal
              logs={auditLogs.auditLogs}
              cursor={auditLogs.auditLogsCursor}
              loading={auditLogs.loadingAuditLogs}
              onClose={auditLogs.closeAuditLogs}
              onLoadMore={auditLogs.loadMoreAuditLogs}
              onRefresh={auditLogs.refreshAuditLogs}
            />
          )}
        </div>
      </UserContext.Provider>
    </NoticeContext.Provider>
  );
}
