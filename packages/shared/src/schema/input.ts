import { z } from 'zod';
import {
  ConnectedApplicationBaseSchema as ConnectedAppBaseSchema,
  EmailProcessingRuleSchema,
  GmailPubsubTopicNameSchema,
  ProviderIdSchema,
  ConnectionMethodSchema,
  UuidSchema,
  nonEmptyStringSchema,
} from './common';
import { MAX_EMAIL_PROCESSING_RULES } from '../constants';
import {
  APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE,
  APPLICATION_CONTEXT_DOCUMENT_STATUS_DELETED,
  APPLICATION_CONTEXT_DOCUMENT_STATUS_ERROR,
  EMAIL_ACTION_STATUS_CANCELLED,
  EMAIL_ACTION_STATUS_EXECUTING,
  EMAIL_ACTION_STATUS_EXPIRED,
  EMAIL_ACTION_STATUS_FAILED,
  EMAIL_ACTION_STATUS_PENDING,
  EMAIL_ACTION_STATUS_SUCCEEDED,
  CONNECTION_METHOD_OAUTH2,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_SUPPORTED_CONNECTION_METHODS,
  PROCESSED_MESSAGE_STATUS_ERROR,
  PROCESSED_MESSAGE_STATUS_PROCESSING,
  PROCESSED_MESSAGE_STATUS_SKIPPED,
  PROCESSED_MESSAGE_STATUS_SUMMARIZED,
  BACKGROUND_TASK_TYPE_ACTION_STATUS_SYNC,
  BACKGROUND_TASK_TYPE_CALENDAR_SYNC,
  BACKGROUND_TASK_TYPE_GOOGLE_DRIVE_SYNC,
  BACKGROUND_TASK_TYPE_IMAP_POLLING,
  BACKGROUND_TASK_TYPE_OAUTH2_REFRESH,
  BACKGROUND_TASK_TYPE_ONEDRIVE_SYNC,
  BACKGROUND_TASK_TYPE_SCHEDULED_ACTION_EXECUTION,
  BACKGROUND_TASK_TYPE_SCHEDULED_DIGEST,
  MAX_CHAT_HISTORY_ENTRIES,
  MAX_CHAT_MESSAGE_CHARS,
  MAX_CHAT_QUERY_CHARS,
} from '../constants';

interface RequestInputSchema {
  body?: z.ZodType;
  query?: z.ZodType;
}

const CreateAppBodySchema = ConnectedAppBaseSchema.extend({
  enabledFeatures: z.array(z.string()).optional().nullable(),
  timeZone: z.string().max(64).optional().nullable(),
  contentLanguage: z.string().max(32).optional().nullable(),
});

const UpdateAppBodySchema = z
  .object({
    applicationId: UuidSchema,
    displayName: nonEmptyStringSchema('displayName', 128),
    providerId: ProviderIdSchema,
    connectionMethod: ConnectionMethodSchema,
    clientId: z.string().max(512).optional(),
    clientSecret: z.string().max(2048).optional(),
    gmailPubsubTopicName: GmailPubsubTopicNameSchema.optional(),
    enabledFeatures: z.array(z.string()).optional().nullable(),
    senderDomainFilters: z
      .object({
        includeRules: z.array(z.string().max(320)).max(100),
      })
      .optional()
      .nullable(),
    timeZone: z.string().max(64).optional().nullable(),
    contentLanguage: z.string().max(32).optional().nullable(),
    autoExecuteActionTypes: z.array(z.string()).optional().nullable(),
    imapHost: z.string().max(253).optional(),
    imapPort: z.number().int().min(1).max(65_535).optional(),
    imapUsername: z.string().max(512).optional(),
    imapPassword: z.string().max(2048).optional(),
    smtpHost: z.string().max(253).optional(),
    smtpPort: z.number().int().min(1).max(65_535).optional(),
  })
  .refine(
    (input): boolean => PROVIDER_SUPPORTED_CONNECTION_METHODS[input.providerId]?.includes(input.connectionMethod) ?? false,
    'providerId and connectionMethod are not a supported combination.',
  )
  .refine(
    (input): boolean =>
      input.providerId !== PROVIDER_GOOGLE_GMAIL ||
      input.connectionMethod !== CONNECTION_METHOD_OAUTH2 ||
      Boolean(input.gmailPubsubTopicName),
    'gmailPubsubTopicName is required for Gmail OAuth2 applications.',
  );

const DeleteAppBodySchema = z.object({
  applicationId: UuidSchema,
});

const UpdateAppContextBodySchema = z.object({
  applicationId: UuidSchema,
  contextIndexingEnabled: z.boolean().optional(),
  ragRetrievalEnabled: z.boolean().optional(),
  maxContextDocuments: z.number().int().positive().nullable().optional(),
  attachmentVisionEnabled: z.boolean().optional(),
});

const DeleteAppContextDocumentsBodySchema = z.object({
  applicationId: UuidSchema,
});

const AppContextListQuerySchema = z.object({
  applicationId: UuidSchema.optional(),
  status: z
    .enum([
      APPLICATION_CONTEXT_DOCUMENT_STATUS_ACTIVE,
      APPLICATION_CONTEXT_DOCUMENT_STATUS_DELETED,
      APPLICATION_CONTEXT_DOCUMENT_STATUS_ERROR,
    ])
    .optional(),
  cursor: nonEmptyStringSchema('cursor', 64).optional(),
});

const AppContextDeletionRunsQuerySchema = z.object({
  applicationId: UuidSchema.optional(),
  cursor: nonEmptyStringSchema('cursor', 64).optional(),
});

const EmailActionCallbackQuerySchema = z.object({
  token: nonEmptyStringSchema('token', 256),
});

/**
 * `z.coerce.boolean()` is wrong for query strings: it applies JS truthiness, so
 * `?showSnoozed=false` and `?showSnoozed=0` both become `true`. Accept the
 * spellings a query string can actually carry.
 */
const QueryBooleanSchema = z.enum(['true', 'false', '1', '0']).transform((value: string): boolean => value === 'true' || value === '1');

const EmailActionListQuerySchema = z.object({
  applicationId: UuidSchema.optional(),
  status: z
    .enum([
      EMAIL_ACTION_STATUS_PENDING,
      EMAIL_ACTION_STATUS_EXECUTING,
      EMAIL_ACTION_STATUS_SUCCEEDED,
      EMAIL_ACTION_STATUS_FAILED,
      EMAIL_ACTION_STATUS_EXPIRED,
      EMAIL_ACTION_STATUS_CANCELLED,
    ])
    .optional(),
  cursor: nonEmptyStringSchema('cursor', 64).optional(),
  showSnoozed: QueryBooleanSchema.optional().default(false),
});

const ActionSnoozeBodySchema = z.object({
  snoozedUntil: z.string().datetime().nullable(),
});

const ActionScheduleBodySchema = z.object({
  scheduledFor: z.string().datetime().nullable(),
});

const OAuth2AuthorizeBodySchema = z.object({
  applicationId: UuidSchema,
});

const AppFoldersQuerySchema = z.object({
  applicationId: UuidSchema,
});

const AppIntegrationsQuerySchema = z.object({
  applicationId: UuidSchema,
});

const UpdateAppWatchSettingsBodySchema = z.object({
  applicationId: UuidSchema,
  folderIds: z.array(nonEmptyStringSchema('folderIds', 512)).nullable(),
  folderNames: z.record(nonEmptyStringSchema('folderNames.key', 512), nonEmptyStringSchema('folderNames.value', 512)).optional(),
});

const WatchApplicationBodySchema = z.object({
  applicationId: UuidSchema,
});

const StopApplicationBodySchema = z.object({
  applicationId: UuidSchema,
});

const OAuth2CallbackQuerySchema = z
  .object({
    code: nonEmptyStringSchema('code', 4096).optional(),
    state: nonEmptyStringSchema('state', 512).optional(),
    error: nonEmptyStringSchema('error', 1024).optional(),
  })
  .refine((input): boolean => Boolean(input.error || (input.code && input.state)), 'OAuth2 callback requires code and state.');

const GmailWebhookQuerySchema = z.object({
  token: nonEmptyStringSchema('token', 256),
});

const OutlookWebhookQuerySchema = z.object({
  validationToken: nonEmptyStringSchema('validationToken', 4096).optional(),
});

const GmailWebhookBodySchema = z.object({
  message: z.object({
    data: nonEmptyStringSchema('message.data', 8192),
    messageId: nonEmptyStringSchema('message.messageId', 512).optional(),
    publishTime: nonEmptyStringSchema('message.publishTime', 128).optional(),
  }),
  subscription: nonEmptyStringSchema('subscription', 1024).optional(),
});

const OutlookNotificationSchema = z.object({
  subscriptionId: nonEmptyStringSchema('subscriptionId', 512),
  clientState: nonEmptyStringSchema('clientState', 256).optional(),
  changeType: nonEmptyStringSchema('changeType', 64).optional(),
  lifecycleEvent: nonEmptyStringSchema('lifecycleEvent', 128).optional(),
  resource: nonEmptyStringSchema('resource', 2048).optional(),
  resourceData: z
    .object({
      id: nonEmptyStringSchema('resourceData.id', 1024).optional(),
    })
    .optional(),
});

const OutlookWebhookBodySchema = z.object({
  value: z.array(OutlookNotificationSchema).optional(),
});

const ApplicationRulesQuerySchema = z.object({
  applicationId: UuidSchema,
});

const UpdateApplicationRulesBodySchema = z.object({
  applicationId: UuidSchema,
  rules: z.array(EmailProcessingRuleSchema).max(MAX_EMAIL_PROCESSING_RULES, `Maximum ${MAX_EMAIL_PROCESSING_RULES} rules per application.`),
});

const SuggestApplicationRuleBodySchema = z.object({
  applicationId: UuidSchema,
  description: nonEmptyStringSchema('description', 500),
});

const DigestConfigQuerySchema = z.object({
  applicationId: UuidSchema,
});

const UpdateDigestConfigBodySchema = z.object({
  applicationId: UuidSchema,
  enabled: z.boolean(),
  sendTime: z.string().max(8),
  sections: z.array(z.string()).max(20),
});

// ─── Outbound integrations ───
// `webhookUrl` is fetched by the integration observer on every processed email,
// so an unvalidated value is a stored SSRF primitive. zod's `.url()` alone is
// not enough: it happily accepts `http://169.254.169.254/…` and
// `http://127.0.0.1:8080/admin`, so the host is checked explicitly.
const IntegrationTypeSchema = z.enum(['slack', 'discord', 'webhook']);

/**
Literal IP literals inside these ranges are never a legitimate destination.
*/
const PRIVATE_IPV4_PATTERNS: readonly RegExp[] = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./];

/**
Non-routable IPv6 literals: loopback, link-local, unique-local, unspecified.
*/
const PRIVATE_IPV6_PATTERN: RegExp = /^(?:\[?::1\]?|\[?::\]?|\[?fe80:|\[?fc|\[?fd)/i;

const BLOCKED_HOSTNAMES: ReadonlySet<string> = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  // AWS/Azure/GCP instance metadata aliases
  'instance-data',
]);

const isPrivateHost = (hostname: string): boolean => {
  const host: string = hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    PRIVATE_IPV6_PATTERN.test(host) ||
    PRIVATE_IPV4_PATTERNS.some((pattern: RegExp): boolean => pattern.test(host))
  )
    return true;
  // `0x7f.1` / `2130706433` style obfuscated loopback literals
  if (/^\d+$/.test(host)) return true;
  return false;
};

const WebhookUrlSchema = z
  .string()
  .max(2048, 'webhookUrl must be 2048 characters or less.')
  .url('webhookUrl must be a valid URL.')
  .refine((value: string): boolean => /^https?:\/\//i.test(value), 'webhookUrl must use http or https.')
  .refine((value: string): boolean => {
    try {
      return !isPrivateHost(new URL(value).hostname);
    } catch {
      return false;
    }
  }, 'webhookUrl must not target a private, loopback, or link-local address.');

// NOTE: this rejects literal private targets at the API boundary. It cannot
// stop DNS rebinding, where a public hostname later resolves to a private
// address; closing that needs a check on the resolved IP at fetch time in
// `IntegrationObserver`, plus disabling redirect following.

const CreateIntegrationBodySchema = z.object({
  applicationId: UuidSchema,
  integrationType: IntegrationTypeSchema,
  name: nonEmptyStringSchema('name', 128),
  webhookUrl: WebhookUrlSchema,
});

const UpdateIntegrationBodySchema = z.object({
  integrationId: UuidSchema,
  name: nonEmptyStringSchema('name', 128).optional(),
  enabled: z.boolean().optional(),
  webhookUrl: WebhookUrlSchema.optional(),
});

const DeleteIntegrationBodySchema = z.object({
  integrationId: UuidSchema,
});

const TestIntegrationBodySchema = z.object({
  integrationId: UuidSchema,
});

const IntegrationDeliveriesQuerySchema = z.object({
  integrationId: UuidSchema.optional(),
  cursor: nonEmptyStringSchema('cursor', 64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ─── Digest / error acknowledgement ───

const SendDigestNowBodySchema = z.object({
  applicationId: UuidSchema,
});

const DismissApplicationErrorBodySchema = z.object({
  applicationId: UuidSchema,
  // Without the enum, `acknowledgeError` falls through to its `else` branch
  // and clears the *context* error instead — silently, and with a 200.
  errorType: z.enum(['processing', 'context']),
});

// ─── Chat ───
// `history` is spliced straight into the Workers AI `messages` array. Without
// this the caller controls both the message count per entry's size and the
// `role` value, which allows a client-supplied `system` turn to override the
// server prompt as well as unbounded token spend.
const ChatRoleSchema = z.enum(['user', 'assistant']);

const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: nonEmptyStringSchema('content', MAX_CHAT_MESSAGE_CHARS),
});

const ChatBodySchema = z.object({
  query: nonEmptyStringSchema('query', MAX_CHAT_QUERY_CHARS),
  applicationId: UuidSchema.optional(),
  history: z.array(ChatMessageSchema).max(MAX_CHAT_HISTORY_ENTRIES).optional(),
});

// ─── Processing / cron visibility ───

const BackgroundTaskRunStatusSchema = z.enum(['running', 'success', 'partial_success', 'error', 'skipped']);

const ListTaskRunsQuerySchema = z.object({
  taskType: nonEmptyStringSchema('taskType', 64).optional(),
  applicationId: UuidSchema.optional(),
  status: BackgroundTaskRunStatusSchema.optional(),
  cursor: nonEmptyStringSchema('cursor', 64).optional(),
});

const ListCalendarEventsQuerySchema = z.object({
  applicationId: UuidSchema.optional(),
  cursor: nonEmptyStringSchema('cursor', 64).optional(),
});

const ProcessedMessageStatusSchema = z.enum([
  PROCESSED_MESSAGE_STATUS_PROCESSING,
  PROCESSED_MESSAGE_STATUS_SUMMARIZED,
  PROCESSED_MESSAGE_STATUS_SKIPPED,
  PROCESSED_MESSAGE_STATUS_ERROR,
]);

const ListProcessedMessagesQuerySchema = z.object({
  applicationId: UuidSchema.optional(),
  status: ProcessedMessageStatusSchema.optional(),
  cursor: nonEmptyStringSchema('cursor', 64).optional(),
});

const RunTaskNowBodySchema = z.object({
  taskType: z.enum([
    BACKGROUND_TASK_TYPE_CALENDAR_SYNC,
    BACKGROUND_TASK_TYPE_ACTION_STATUS_SYNC,
    BACKGROUND_TASK_TYPE_IMAP_POLLING,
    BACKGROUND_TASK_TYPE_SCHEDULED_DIGEST,
    BACKGROUND_TASK_TYPE_OAUTH2_REFRESH,
    BACKGROUND_TASK_TYPE_SCHEDULED_ACTION_EXECUTION,
    BACKGROUND_TASK_TYPE_GOOGLE_DRIVE_SYNC,
    BACKGROUND_TASK_TYPE_ONEDRIVE_SYNC,
  ]),
  applicationId: UuidSchema,
});

// ─── User / analytics / activity ───

const UpdateCurrentUserBodySchema = z.object({
  preferredLanguage: nonEmptyStringSchema('preferredLanguage', 32),
});

const ListAnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
  applicationId: UuidSchema.optional(),
});

const ActivityEventTypeSchema = z.enum(['email_processed', 'action_created', 'action_executed']);

/**
 * `?types=action_created` arrives as a string and `?types=a&types=b` as an
 * array, so normalize before validating against the enum list.
 */
const ActivityEventTypesSchema = z
  .preprocess((value: unknown): unknown => (typeof value === 'string' ? [value] : value), z.array(ActivityEventTypeSchema).max(3))
  .optional();

const ListActivityQuerySchema = z.object({
  format: z.enum(['csv']).optional(),
  types: ActivityEventTypesSchema,
  applicationId: UuidSchema.optional(),
  cursor: nonEmptyStringSchema('cursor', 64).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const ListLabelsQuerySchema = z.object({
  applicationId: nonEmptyStringSchema('applicationId', 64).optional(),
});

const ContextAuditLogsQuerySchema = z.object({
  cursor: nonEmptyStringSchema('cursor', 64).optional(),
});

// ─── Webhooks ───

const FastmailWebhookBodySchema = z.object({
  emailId: nonEmptyStringSchema('emailId', 512),
  type: nonEmptyStringSchema('type', 64).optional(),
  message: nonEmptyStringSchema('message', 2048).optional(),
});

const FastmailWebhookQuerySchema = z.object({
  token: nonEmptyStringSchema('token', 256),
});

const RequestInputSchemas: Record<string, RequestInputSchema> = {
  'POST /user/application': { body: CreateAppBodySchema },
  'PUT /user/application': { body: UpdateAppBodySchema },
  'DELETE /user/application': { body: DeleteAppBodySchema },
  'PUT /user/application/context': { body: UpdateAppContextBodySchema },
  'POST /user/application/context/delete-documents': { body: DeleteAppContextDocumentsBodySchema },
  'GET /user/application/context/documents': { query: AppContextListQuerySchema },
  'GET /user/application/context/deletions': { query: AppContextDeletionRunsQuerySchema },
  'GET /user/application/context/document/:contextDocumentId/provider-link': {},
  'GET /user/application/context/document/:contextDocumentId/logs': { query: ContextAuditLogsQuerySchema },
  'GET /user/actions': { query: EmailActionListQuerySchema },
  'GET /user/actions/:actionId/executions': {},
  'POST /user/actions/:actionId/execute': {},
  'POST /user/actions/:actionId/snooze': { body: ActionSnoozeBodySchema },
  'POST /user/actions/:actionId/schedule': { body: ActionScheduleBodySchema },
  'POST /user/application/oauth2/authorize': { body: OAuth2AuthorizeBodySchema },
  'GET /user/application/folders': { query: AppFoldersQuerySchema },
  'GET /user/application/labels': { query: ListLabelsQuerySchema },
  'GET /user/application/integrations': { query: AppIntegrationsQuerySchema },
  'POST /user/application/integration': { body: CreateIntegrationBodySchema },
  'PUT /user/application/integration': { body: UpdateIntegrationBodySchema },
  'DELETE /user/application/integration': { body: DeleteIntegrationBodySchema },
  'POST /user/application/integration/test': { body: TestIntegrationBodySchema },
  'GET /user/application/integration/deliveries': { query: IntegrationDeliveriesQuerySchema },
  'PUT /user/application/watch-settings': { body: UpdateAppWatchSettingsBodySchema },
  'POST /user/application/watch': { body: WatchApplicationBodySchema },
  'POST /user/application/stop': { body: StopApplicationBodySchema },
  'GET /user/application/rules': { query: ApplicationRulesQuerySchema },
  'PUT /user/application/rules': { body: UpdateApplicationRulesBodySchema },
  'POST /user/application/rules/suggest': { body: SuggestApplicationRuleBodySchema },
  'GET /user/application/digest': { query: DigestConfigQuerySchema },
  'PUT /user/application/digest': { body: UpdateDigestConfigBodySchema },
  'POST /user/application/digest/send': { body: SendDigestNowBodySchema },
  'POST /user/application/dismiss-error': { body: DismissApplicationErrorBodySchema },
  'GET /user/me': {},
  'PUT /user/me': { body: UpdateCurrentUserBodySchema },
  'GET /user/applications': {},
  'GET /user/analytics': { query: ListAnalyticsQuerySchema },
  'GET /user/activity': { query: ListActivityQuerySchema },
  'POST /user/chat': { body: ChatBodySchema },
  'GET /user/processing/task-runs': { query: ListTaskRunsQuerySchema },
  'GET /user/processing/calendar-events': { query: ListCalendarEventsQuerySchema },
  'GET /user/processing/messages': { query: ListProcessedMessagesQuerySchema },
  'POST /user/processing/run-task': { body: RunTaskNowBodySchema },
  'GET /api/oauth2/callback/:applicationId': { query: OAuth2CallbackQuerySchema },
  'GET /api/actions/:actionId': { query: EmailActionCallbackQuerySchema },
  'POST /api/actions/:actionId/execute': { query: EmailActionCallbackQuerySchema },
  'POST /api/webhooks/fastmail/:applicationId': { query: FastmailWebhookQuerySchema, body: FastmailWebhookBodySchema },
  'POST /api/webhooks/gmail/:applicationId': { query: GmailWebhookQuerySchema, body: GmailWebhookBodySchema },
  'GET /api/webhooks/outlook/:applicationId': { query: OutlookWebhookQuerySchema },
  'POST /api/webhooks/outlook/:applicationId': { query: OutlookWebhookQuerySchema, body: OutlookWebhookBodySchema },
  'GET /api/webhooks/outlook/lifecycle/:applicationId': { query: OutlookWebhookQuerySchema },
  'POST /api/webhooks/outlook/lifecycle/:applicationId': { query: OutlookWebhookQuerySchema, body: OutlookWebhookBodySchema },
};

export {
  ActionScheduleBodySchema,
  ActionSnoozeBodySchema,
  ApplicationRulesQuerySchema,
  ChatBodySchema,
  ChatMessageSchema,
  CreateIntegrationBodySchema,
  DeleteIntegrationBodySchema,
  DismissApplicationErrorBodySchema,
  DigestConfigQuerySchema,
  FastmailWebhookBodySchema,
  ListActivityQuerySchema,
  ListAnalyticsQuerySchema,
  ListCalendarEventsQuerySchema,
  ListLabelsQuerySchema,
  ListProcessedMessagesQuerySchema,
  ListTaskRunsQuerySchema,
  RequestInputSchemas,
  RunTaskNowBodySchema,
  SendDigestNowBodySchema,
  SuggestApplicationRuleBodySchema,
  TestIntegrationBodySchema,
  UpdateApplicationRulesBodySchema,
  UpdateCurrentUserBodySchema,
  UpdateDigestConfigBodySchema,
  UpdateIntegrationBodySchema,
};
export type { RequestInputSchema };
