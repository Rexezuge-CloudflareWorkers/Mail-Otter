// Direct re-exports of every endpoint class. The previous form imported
// each class under an `Original*` alias and then re-asserted
// `export const X: typeof OriginalX = OriginalX`, adding a layer of indirection
// and no information.

export { GetAnalyticsRoute } from './user/analytics/GET';
export { GetCurrentUserRoute } from './user/me/GET';
export { UpdateCurrentUserRoute } from './user/me/PUT';
export { ListApplicationsRoute } from './user/applications/GET';
export { CreateApplicationRoute } from './user/application/POST';
export { UpdateApplicationRoute } from './user/application/PUT';
export { DeleteApplicationRoute } from './user/application/DELETE';
export { UpdateApplicationContextRoute } from './user/application/context/PUT';
export { DismissApplicationErrorRoute } from './user/application/dismiss-error/POST';
export { DeleteApplicationContextDocumentsRoute } from './user/application/context/delete-documents/POST';
export { ListApplicationContextDocumentsRoute } from './user/application/context/documents/GET';
export { ListApplicationContextDeletionRunsRoute } from './user/application/context/deletions/GET';
export { GetApplicationContextDocumentProviderLinkRoute } from './user/application/context/document/provider-link/GET';
export { ListContextDocumentAuditLogsRoute } from './user/application/context/document/audit-logs/GET';
export { ListEmailActionsRoute } from './user/actions/GET';
export { ListEmailActionExecutionsRoute } from './user/actions/executions/GET';
export { ExecuteUserEmailActionRoute } from './user/actions/execute/POST';
export { SnoozeEmailActionRoute } from './user/actions/snooze/POST';
export { ScheduleEmailActionRoute } from './user/actions/schedule/POST';
export { GetApplicationFoldersRoute } from './user/application/folders/GET';
export { UpdateApplicationWatchSettingsRoute } from './user/application/watch-settings/PUT';
export { CreateOAuth2AuthorizationRoute } from './user/application/oauth2/authorize/POST';
export { StartApplicationWatchRoute } from './user/application/watch/POST';
export { StopApplicationWatchRoute } from './user/application/stop/POST';
export { OAuth2CallbackRoute } from './api/oauth2/callback/GET';
export { GetActionConfirmationRoute } from './api/actions/GET';
export { ExecuteActionCallbackRoute } from './api/actions/execute/POST';
export { FastmailWebhookRoute } from './api/webhooks/fastmail/POST';
export { GmailWebhookRoute } from './api/webhooks/gmail/POST';
export { OutlookWebhookRoute } from './api/webhooks/outlook/POST';
export { OutlookLifecycleWebhookRoute } from './api/webhooks/outlook/lifecycle/POST';
export { ListIntegrationsRoute } from './user/application/integrations/GET';
export { CreateIntegrationRoute } from './user/application/integrations/POST';
export { UpdateIntegrationRoute } from './user/application/integrations/PUT';
export { DeleteIntegrationRoute } from './user/application/integrations/DELETE';
export { TestIntegrationRoute } from './user/application/integrations/test/POST';
export { ListIntegrationDeliveriesRoute } from './user/application/integrations/deliveries/GET';
export { GetApplicationRulesRoute } from './user/application/rules/GET';
export { UpdateApplicationRulesRoute } from './user/application/rules/PUT';
export { SuggestApplicationRuleRoute } from './user/application/rules/suggest/POST';
export { GetApplicationLabelsRoute } from './user/application/labels/GET';
export { GetDigestConfigRoute } from './user/application/digest/GET';
export { UpdateDigestConfigRoute } from './user/application/digest/PUT';
export { SendDigestNowRoute } from './user/application/digest/send/POST';
export { ListBackgroundTaskRunsRoute } from './user/processing/task-runs/GET';
export { ListProcessingCalendarEventsRoute } from './user/processing/calendar-events/GET';
export { ListProcessedMessagesRoute } from './user/processing/messages/GET';
export { RunTaskNowRoute } from './user/processing/run-task/POST';
export { ListActivityRoute } from './user/activity/GET';
export { ChatRoute } from './user/chat/POST';
