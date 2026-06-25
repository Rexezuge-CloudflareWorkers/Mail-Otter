import { useEffect, useState } from 'react';
import Unauthorized from '../components/Unauthorized';
import type { ActiveView } from './types';
import { Header } from './components/layout/Header';
import { NoticeBar } from './components/layout/NoticeBar';
import { MailboxesView } from './components/views/MailboxesView';
import { ContextAuditView } from './components/views/ContextAuditView';
import { ActionsView } from './components/views/ActionsView';
import { AnalyticsView } from './components/views/AnalyticsView';
import { HelpView } from './components/views/HelpView';
import { ProcessingView } from './components/views/ProcessingView';
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
import { getUrlParam, useSyncedUrl } from './hooks/useSyncedUrl';
import { useMailboxCallbacksValue } from './hooks/useMailboxCallbacksValue';
import type { ApplicationContextDocumentStatus, EmailActionStatus } from '../components/types';

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
  const { user, authorized } = useCurrentUser();
  const auditLogs = useAuditLogs({ showNotice });

  const contextAudit = useContextAudit({ showNotice });
  const actions = useActions({ setIsBusy, showNotice });
  const analytics = useAnalytics({ showNotice });
  const processing = useProcessing({ showNotice });

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
    if (authorized && activeView === 'context') {
      void contextAudit.loadContextAudit();
    }
  }, [activeView, authorized]);

  useEffect(() => {
    if (authorized && activeView === 'actions') {
      void actions.loadActions();
    }
  }, [activeView, authorized]);

  useEffect(() => {
    if (authorized && activeView === 'analytics') {
      void analytics.loadAnalytics();
    }
  }, [activeView, authorized]);

  useEffect(() => {
    if (authorized && activeView === 'processing') {
      void processing.loadProcessing();
    }
  }, [activeView, authorized]);

  // Sync current state back to the URL
  const effectiveAppId =
    activeView === 'mailboxes'
      ? mailboxes.selectedApplicationId
      : activeView === 'context'
        ? contextAudit.auditApplicationId
        : activeView === 'analytics'
          ? analytics.analyticsApplicationId
          : activeView === 'processing'
            ? processing.processingApplicationId
            : actions.actionApplicationId;

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

          {activeView === 'analytics' && (
            <AnalyticsView
              applications={mailboxes.applications}
              days={analytics.analyticsDays}
              setDays={(d) => { analytics.setAnalyticsDays(d); void analytics.loadAnalytics(d, analytics.analyticsApplicationId || undefined); }}
              applicationId={analytics.analyticsApplicationId}
              setApplicationId={(id) => { analytics.setAnalyticsApplicationId(id); void analytics.loadAnalytics(analytics.analyticsDays, id || undefined); }}
              data={analytics.analyticsData}
              loading={analytics.analyticsLoading}
              onRefresh={() => void analytics.loadAnalytics()}
            />
          )}

          {activeView === 'processing' && (
            <ProcessingView
              applications={mailboxes.applications}
              applicationId={processing.processingApplicationId}
              setApplicationId={processing.setProcessingApplicationId}
              taskType={processing.processingTaskType}
              setTaskType={processing.setProcessingTaskType}
              runStatus={processing.processingRunStatus}
              setRunStatus={processing.setProcessingRunStatus}
              messageStatus={processing.processingMessageStatus}
              setMessageStatus={processing.setProcessingMessageStatus}
              taskRuns={processing.taskRuns}
              taskRunsCursor={processing.taskRunsCursor}
              taskRunsLoading={processing.taskRunsLoading}
              calendarEvents={processing.calendarEvents}
              calendarEventsCursor={processing.calendarEventsCursor}
              calendarEventsLoading={processing.calendarEventsLoading}
              processedMessages={processing.processedMessages}
              processedMessagesCursor={processing.processedMessagesCursor}
              processedMessagesLoading={processing.processedMessagesLoading}
              onRefresh={() => void processing.loadProcessing()}
              onTriggerTaskRun={() => void processing.triggerTaskRun()}
              triggeringTask={processing.triggeringTask}
              onLoadMoreTaskRuns={() => void processing.loadTaskRuns(true, processing.taskRunsCursor)}
              onLoadMoreCalendarEvents={() => void processing.loadCalendarEvents(true, processing.calendarEventsCursor)}
              onLoadMoreProcessedMessages={() => void processing.loadProcessedMessages(true, processing.processedMessagesCursor)}
            />
          )}

          {activeView === 'help' && <HelpView />}

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
