import { useEffect, useState } from 'react';
import Unauthorized from './components/layout/Unauthorized';
import type { ActiveView } from './types';
import { Header } from './components/layout/Header';
import { NoticeBar } from './components/layout/NoticeBar';
import { SpaViewRouter } from './components/layout/SpaViewRouter';
import { ConfirmDeleteModal } from './components/modals/ConfirmDeleteModal';
import { AuditLogsModal } from './components/modals/AuditLogsModal';
import { IntegrationDeliveryLogsModal } from './components/modals/IntegrationDeliveryLogsModal';
import { NoticeContext } from './contexts/NoticeContext';
import { UserContext } from './contexts/UserContext';
import { MailboxCallbacksContext } from './contexts/MailboxCallbacksContext';
import { useNotice } from './hooks/useNotice';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useMailboxes } from './hooks/useMailboxes';
import { useContextAudit } from './hooks/useContextAudit';
import { useActions } from './hooks/useActions';
import { useAuditLogs } from './hooks/useAuditLogs';
import { useAnalytics } from './hooks/useAnalytics';
import { useProcessing } from './hooks/useProcessing';
import { useActivity } from './hooks/useActivity';
import { useChat } from './hooks/useChat';
import { getUrlParam, useSyncedUrl } from './hooks/useSyncedUrl';
import { useMailboxCallbacksValue } from './hooks/useMailboxCallbacksValue';
import { useSpaLanguage } from './hooks/useSpaLanguage';
import type { ApplicationContextDocumentStatus, EmailActionStatus } from './types';

// Read URL params synchronously before first render so useState initializers can use them
const initialView = getUrlParam('view', 'mailboxes') as ActiveView;
const initialAppId = getUrlParam('appId', '');
const initialStatus = getUrlParam('status', '');
const initialActionId = getUrlParam('actionId', '');
const initialLogDocId = getUrlParam('logDocId', '');

export default function SpaApp() {
  const [activeView, setActiveView] = useState<ActiveView>(initialView);
  const [isBusy, setIsBusy] = useState(false);

  const { notice, showNotice } = useNotice();
  const { user, setUser, authorized } = useCurrentUser();
  const { language, languageStatus, languagePending, handleLanguageChange } = useSpaLanguage({ user, showNotice, setUser });
  const auditLogs = useAuditLogs({ showNotice });

  const contextAudit = useContextAudit({ showNotice });
  const actions = useActions({ setIsBusy, showNotice });
  const analytics = useAnalytics({ showNotice });
  const processing = useProcessing({ showNotice });
  const activity = useActivity({ showNotice });
  const chat = useChat({ showNotice });

  const mailboxes = useMailboxes({
    setIsBusy,
    showNotice,
    onContextChanged: () => { void contextAudit.loadContextAudit(); },
  });

  // Seed URL-provided values into their domains once on mount
  useEffect(() => {
    if (initialView === 'context' && initialAppId) contextAudit.setAuditApplicationId(initialAppId);
    if (initialView === 'context' && initialStatus) contextAudit.setAuditStatus(initialStatus as ApplicationContextDocumentStatus);
    if (initialView === 'actions' && initialAppId) actions.setActionApplicationId(initialAppId);
    if (initialView === 'actions' && initialStatus) actions.setActionStatus(initialStatus as EmailActionStatus);
    if (initialView === 'actions' && initialActionId) actions.setSelectedActionId(initialActionId);
    if (initialView === 'mailboxes' && initialAppId) mailboxes.setSelectedApplicationId(initialAppId);
    if (initialView === 'context' && initialLogDocId) void auditLogs.openAuditLogs(initialLogDocId);
  }, []);

  // Load applications once the user is authorized
  useEffect(() => {
    if (authorized) {
      mailboxes.loadApplications().catch(() => {});
    }
  }, [authorized]);

  // Load view-specific data when the active view becomes visible
  useEffect(() => {
    if (!authorized) return;
    switch (activeView) {
      case 'context': {
        void contextAudit.loadContextAudit();
        break;
      }
      case 'actions': {
        void actions.loadActions();
        break;
      }
      case 'analytics': {
        void analytics.loadAnalytics();
        break;
      }
      case 'processing': {
        void processing.loadProcessing();
        break;
      }
      case 'activity': {
        void activity.loadActivity();
        break;
      }
      default: {
        break;
      }
    }
  }, [activeView, authorized]);

  // Sync current state back to the URL
  const appIdByView: Record<ActiveView, string> = {
    mailboxes: mailboxes.selectedApplicationId,
    context: contextAudit.auditApplicationId,
    actions: actions.actionApplicationId,
    activity: activity.activityApplicationId,
    chat: chat.chatApplicationId,
    analytics: analytics.analyticsApplicationId,
    processing: processing.processingApplicationId,
    help: '',
  };
  const effectiveAppId = appIdByView[activeView];

  useSyncedUrl({
    view: activeView,
    appId: effectiveAppId,
    status: activeView === 'context' ? contextAudit.auditStatus : activeView === 'actions' ? actions.actionStatus : '',
    actionId: activeView === 'actions' ? actions.selectedActionId : '',
    logDocId: activeView === 'context' ? (auditLogs.auditLogDocumentId ?? '') : '',
  });

  const mailboxCallbacksValue = useMailboxCallbacksValue(mailboxes, contextAudit, isBusy, setActiveView);

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-base)] flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!authorized || !user) return <Unauthorized />;

  const router = (
    <SpaViewRouter
      activeView={activeView}
      mailboxes={mailboxes}
      contextAudit={contextAudit}
      actions={actions}
      analytics={analytics}
      processing={processing}
      activity={activity}
      chat={chat}
      auditLogs={auditLogs}
      isBusy={isBusy}
    />
  );

  return (
    <NoticeContext.Provider value={{ showNotice }}>
      <UserContext.Provider value={user}>
        <div className="min-h-screen bg-[var(--color-surface-base)] text-[var(--color-text-primary)]">
          <Header
            activeView={activeView}
            onViewChange={setActiveView}
            userEmail={user.email}
            aiUsage={user.aiUsage}
            language={languageStatus === 'error' ? 'unknown' : language}
            onLanguageChange={handleLanguageChange}
            languageDisabled={languagePending || languageStatus !== 'ready'}
          />

          {notice && <NoticeBar notice={notice} />}

          {activeView === 'mailboxes' ? (
            <MailboxCallbacksContext.Provider value={mailboxCallbacksValue}>{router}</MailboxCallbacksContext.Provider>
          ) : (
            router
          )}

          {mailboxes.confirmDelete && typeof document !== 'undefined' && (
            <ConfirmDeleteModal
              displayName={mailboxes.confirmDelete.displayName}
              onConfirm={() => {
                const { applicationId } = mailboxes.confirmDelete!;
                mailboxes.setConfirmDelete(null);
                void mailboxes.deleteApplication(applicationId);
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

          {mailboxes.openDeliveryLogsIntegrationId && typeof document !== 'undefined' && (
            <IntegrationDeliveryLogsModal
              logs={mailboxes.deliveryLogsByIntegrationId[mailboxes.openDeliveryLogsIntegrationId] ?? []}
              loading={mailboxes.loadingDeliveryLogs}
              onClose={mailboxes.closeDeliveryLogs}
            />
          )}
        </div>
      </UserContext.Provider>
    </NoticeContext.Provider>
  );
}
