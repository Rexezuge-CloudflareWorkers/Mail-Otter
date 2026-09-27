import type { OpenAPIRoute } from 'chanfana';
import {
  GetAnalyticsRoute,
  ListBackgroundTaskRunsRoute,
  ListProcessingCalendarEventsRoute,
  ListProcessedMessagesRoute,
  RunTaskNowRoute,
  ListActivityRoute,
  ChatRoute,
  CreateApplicationRoute,
  GetApplicationRulesRoute,
  UpdateApplicationRulesRoute,
  SuggestApplicationRuleRoute,
  GetApplicationLabelsRoute,
  GetDigestConfigRoute,
  UpdateDigestConfigRoute,
  SendDigestNowRoute,
  ListIntegrationsRoute,
  CreateIntegrationRoute,
  UpdateIntegrationRoute,
  DeleteIntegrationRoute,
  TestIntegrationRoute,
  ListIntegrationDeliveriesRoute,
  CreateOAuth2AuthorizationRoute,
  DeleteApplicationRoute,
  DeleteApplicationContextDocumentsRoute,
  DismissApplicationErrorRoute,
  ExecuteActionCallbackRoute,
  ExecuteUserEmailActionRoute,
  GetActionConfirmationRoute,
  GetCurrentUserRoute,
  UpdateCurrentUserRoute,
  GetApplicationContextDocumentProviderLinkRoute,
  GetApplicationFoldersRoute,
  FastmailWebhookRoute,
  GmailWebhookRoute,
  ListApplicationContextDeletionRunsRoute,
  ListApplicationContextDocumentsRoute,
  ListContextDocumentAuditLogsRoute,
  ListEmailActionExecutionsRoute,
  ListEmailActionsRoute,
  ScheduleEmailActionRoute,
  SnoozeEmailActionRoute,
  ListApplicationsRoute,
  OAuth2CallbackRoute,
  OutlookLifecycleWebhookRoute,
  OutlookWebhookRoute,
  StartApplicationWatchRoute,
  StopApplicationWatchRoute,
  UpdateApplicationContextRoute,
  UpdateApplicationRoute,
  UpdateApplicationWatchSettingsRoute,
} from '@/endpoints';

type RouteMethod = 'get' | 'post' | 'put' | 'delete';

interface RouteDefinition {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: typeof OpenAPIRoute;
}

/**
 * Declarative table of every Chanfana route the API worker serves.
 *
 * Registration used to be three imperative `openapi.get(path, Class)` blocks
 * inside `MailOtterWorker`. That made the route list impossible to enumerate
 * from outside the worker, so nothing could check it against
 * `RequestInputSchemas` — which is how twenty routes ended up with no input
 * schema while `validateRequestInput` failed open. Exposing the table lets
 * `test/schema/RequestValidation.test.ts` assert the two stay in sync.
 *
 * The three groups mirror the auth boundary documented in `apps/api/AGENTS.md`:
 * `userRoutes` sit behind Cloudflare Access, the other two are public.
 */
const userRoutes: readonly RouteDefinition[] = [
  { method: 'get', path: '/user/me', handler: GetCurrentUserRoute },
  { method: 'put', path: '/user/me', handler: UpdateCurrentUserRoute },
  { method: 'get', path: '/user/analytics', handler: GetAnalyticsRoute },
  { method: 'get', path: '/user/applications', handler: ListApplicationsRoute },
  { method: 'post', path: '/user/application', handler: CreateApplicationRoute },
  { method: 'put', path: '/user/application', handler: UpdateApplicationRoute },
  { method: 'delete', path: '/user/application', handler: DeleteApplicationRoute },
  { method: 'post', path: '/user/application/dismiss-error', handler: DismissApplicationErrorRoute },
  { method: 'post', path: '/user/application/oauth2/authorize', handler: CreateOAuth2AuthorizationRoute },
  { method: 'post', path: '/user/application/watch', handler: StartApplicationWatchRoute },
  { method: 'post', path: '/user/application/stop', handler: StopApplicationWatchRoute },
  { method: 'get', path: '/user/application/folders', handler: GetApplicationFoldersRoute },
  { method: 'put', path: '/user/application/watch-settings', handler: UpdateApplicationWatchSettingsRoute },
  { method: 'put', path: '/user/application/context', handler: UpdateApplicationContextRoute },
  { method: 'post', path: '/user/application/context/delete-documents', handler: DeleteApplicationContextDocumentsRoute },
  { method: 'get', path: '/user/application/context/documents', handler: ListApplicationContextDocumentsRoute },
  { method: 'get', path: '/user/application/context/deletions', handler: ListApplicationContextDeletionRunsRoute },
  {
    method: 'get',
    path: '/user/application/context/document/:contextDocumentId/provider-link',
    handler: GetApplicationContextDocumentProviderLinkRoute,
  },
  { method: 'get', path: '/user/application/context/document/:contextDocumentId/logs', handler: ListContextDocumentAuditLogsRoute },
  { method: 'get', path: '/user/application/rules', handler: GetApplicationRulesRoute },
  { method: 'put', path: '/user/application/rules', handler: UpdateApplicationRulesRoute },
  { method: 'post', path: '/user/application/rules/suggest', handler: SuggestApplicationRuleRoute },
  { method: 'get', path: '/user/application/labels', handler: GetApplicationLabelsRoute },
  { method: 'get', path: '/user/application/digest', handler: GetDigestConfigRoute },
  { method: 'put', path: '/user/application/digest', handler: UpdateDigestConfigRoute },
  { method: 'post', path: '/user/application/digest/send', handler: SendDigestNowRoute },
  { method: 'get', path: '/user/application/integrations', handler: ListIntegrationsRoute },
  { method: 'post', path: '/user/application/integration', handler: CreateIntegrationRoute },
  { method: 'put', path: '/user/application/integration', handler: UpdateIntegrationRoute },
  { method: 'delete', path: '/user/application/integration', handler: DeleteIntegrationRoute },
  { method: 'post', path: '/user/application/integration/test', handler: TestIntegrationRoute },
  { method: 'get', path: '/user/application/integration/deliveries', handler: ListIntegrationDeliveriesRoute },
  { method: 'get', path: '/user/actions', handler: ListEmailActionsRoute },
  { method: 'get', path: '/user/actions/:actionId/executions', handler: ListEmailActionExecutionsRoute },
  { method: 'post', path: '/user/actions/:actionId/execute', handler: ExecuteUserEmailActionRoute },
  { method: 'post', path: '/user/actions/:actionId/snooze', handler: SnoozeEmailActionRoute },
  { method: 'post', path: '/user/actions/:actionId/schedule', handler: ScheduleEmailActionRoute },
  { method: 'get', path: '/user/activity', handler: ListActivityRoute },
  { method: 'post', path: '/user/chat', handler: ChatRoute },
  { method: 'get', path: '/user/processing/task-runs', handler: ListBackgroundTaskRunsRoute },
  { method: 'get', path: '/user/processing/calendar-events', handler: ListProcessingCalendarEventsRoute },
  { method: 'get', path: '/user/processing/messages', handler: ListProcessedMessagesRoute },
  { method: 'post', path: '/user/processing/run-task', handler: RunTaskNowRoute },
];

const publicApiRoutes: readonly RouteDefinition[] = [
  { method: 'get', path: '/api/oauth2/callback/:applicationId', handler: OAuth2CallbackRoute },
  { method: 'get', path: '/api/actions/:actionId', handler: GetActionConfirmationRoute },
  { method: 'post', path: '/api/actions/:actionId/execute', handler: ExecuteActionCallbackRoute },
];

const webhookRoutes: readonly RouteDefinition[] = [
  { method: 'post', path: '/api/webhooks/fastmail/:applicationId', handler: FastmailWebhookRoute },
  { method: 'post', path: '/api/webhooks/gmail/:applicationId', handler: GmailWebhookRoute },
  { method: 'get', path: '/api/webhooks/outlook/:applicationId', handler: OutlookWebhookRoute },
  { method: 'post', path: '/api/webhooks/outlook/:applicationId', handler: OutlookWebhookRoute },
  { method: 'get', path: '/api/webhooks/outlook/lifecycle/:applicationId', handler: OutlookLifecycleWebhookRoute },
  { method: 'post', path: '/api/webhooks/outlook/lifecycle/:applicationId', handler: OutlookLifecycleWebhookRoute },
];

const allRoutes: readonly RouteDefinition[] = [...userRoutes, ...publicApiRoutes, ...webhookRoutes];

/**
Every route as the `METHOD /path` key that `RequestInputSchemas` is keyed by.
*/
const allRouteKeys: readonly string[] = allRoutes.map((route: RouteDefinition): string => `${route.method.toUpperCase()} ${route.path}`);

export { allRouteKeys, allRoutes, publicApiRoutes, userRoutes, webhookRoutes };
export type { RouteDefinition, RouteMethod };
