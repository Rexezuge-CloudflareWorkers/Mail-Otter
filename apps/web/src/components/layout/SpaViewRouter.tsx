import { ActionsView } from '../views/ActionsView';
import { ActivityView } from '../views/ActivityView';
import { AnalyticsView } from '../views/AnalyticsView';
import { ChatView } from '../views/ChatView';
import { ContextAuditView } from '../views/ContextAuditView';
import { HelpView } from '../views/HelpView';
import { MailboxesView } from '../views/MailboxesView';
import { ProcessingView } from '../views/ProcessingView';
import type { ActiveView } from '../../types';

interface SpaViewRouterInput {
  activeView: ActiveView;
  mailboxes: Record<string, never>;
  contextAudit: Record<string, never>;
  actions: Record<string, never>;
  analytics: Record<string, never>;
  processing: Record<string, never>;
  activity: Record<string, never>;
  chat: Record<string, never>;
  auditLogs: Record<string, never>;
  isBusy: boolean;
}

/**
 * View switch extracted from `SpaApp` so the shell stays a thin composition
 * root. Props are the already-composed hook slices; no data fetching here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SpaViewRouter(props: any) {
  const { activeView, mailboxes, contextAudit, actions, analytics, processing, activity, chat, auditLogs, isBusy } = props;

  if (activeView === 'mailboxes') {
    return (
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
    );
  }

  if (activeView === 'context') {
    return (
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
    );
  }

  if (activeView === 'actions') {
    return (
      <ActionsView
        applications={mailboxes.applications}
        applicationId={actions.actionApplicationId}
        setApplicationId={actions.setActionApplicationId}
        status={actions.actionStatus}
        setStatus={actions.setActionStatus}
        showSnoozed={actions.showSnoozed}
        setShowSnoozed={actions.setShowSnoozed}
        actions={actions.actions}
        actionsCursor={actions.actionsCursor}
        selectedActionId={actions.selectedActionId}
        executions={actions.actionExecutions}
        onRefresh={() => actions.loadActions()}
        onLoadMore={() => actions.loadActions(true, actions.actionsCursor)}
        onSelectAction={actions.loadActionExecutions}
        onExecuteAction={actions.executeAction}
        onSnoozeAction={actions.snoozeAction}
        onScheduleAction={actions.scheduleAction}
        busy={isBusy}
      />
    );
  }

  if (activeView === 'activity') {
    return (
      <ActivityView
        applications={mailboxes.applications}
        applicationId={activity.activityApplicationId}
        setApplicationId={activity.setActivityApplicationId}
        eventTypes={activity.activityEventTypes}
        setEventTypes={activity.setActivityEventTypes}
        entries={activity.entries}
        cursor={activity.activityCursor}
        loading={activity.activityLoading}
        exporting={activity.activityExporting}
        onRefresh={() => void activity.loadActivity()}
        onLoadMore={() => void activity.loadActivity(true, activity.activityCursor)}
        onExportCsv={() => void activity.exportCsv()}
      />
    );
  }

  if (activeView === 'chat') {
    return (
      <ChatView
        applications={mailboxes.applications}
        applicationId={chat.chatApplicationId}
        setApplicationId={chat.setChatApplicationId}
        messages={chat.messages}
        sources={chat.sources}
        loading={chat.chatLoading}
        onSend={(q: string) => void chat.sendMessage(q)}
        onClear={chat.clearChat}
      />
    );
  }

  if (activeView === 'analytics') {
    return (
      <AnalyticsView
        applications={mailboxes.applications}
        days={analytics.analyticsDays}
        setDays={(d: number) => { analytics.setAnalyticsDays(d); void analytics.loadAnalytics(d, analytics.analyticsApplicationId || undefined); }}
        applicationId={analytics.analyticsApplicationId}
        setApplicationId={(id: string) => { analytics.setAnalyticsApplicationId(id); void analytics.loadAnalytics(analytics.analyticsDays, id || undefined); }}
        data={analytics.analyticsData}
        loading={analytics.analyticsLoading}
        onRefresh={() => void analytics.loadAnalytics()}
      />
    );
  }

  if (activeView === 'processing') {
    return (
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
    );
  }

  return <HelpView />;
}

export { SpaViewRouter };
export type { SpaViewRouterInput };
