import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import { ConnectedApplicationBaseSchema, GmailPubsubTopicNameSchema, ProviderIdSchema, ConnectionMethodSchema, UuidSchema, nonEmptyStringSchema } from './common';
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
  PROVIDER_GOOGLE_GMAIL,
  SUPPORTED_PROVIDER_CONNECTIONS,
} from '../constants';

interface RequestInputSchema {
  body?: ZodTypeAny | undefined;
  query?: ZodTypeAny | undefined;
}

const CreateApplicationBodySchema = ConnectedApplicationBaseSchema;

const UpdateApplicationBodySchema = z
  .object({
    applicationId: UuidSchema,
    displayName: nonEmptyStringSchema('displayName', 128),
    providerId: ProviderIdSchema,
    connectionMethod: ConnectionMethodSchema,
    clientId: z.string().max(512).optional(),
    clientSecret: z.string().max(2048).optional(),
    gmailPubsubTopicName: GmailPubsubTopicNameSchema.optional(),
    enabledFeatures: z.array(z.string()).optional(),
    senderDomainFilters: z
      .object({
        includeRules: z.array(z.string().max(320)).max(100),
        excludeRules: z.array(z.string().max(320)).max(100),
      })
      .optional()
      .nullable(),
  })
  .refine(
    (input): boolean => SUPPORTED_PROVIDER_CONNECTIONS[input.providerId] === input.connectionMethod,
    'providerId and connectionMethod are not a supported combination.',
  )
  .refine(
    (input): boolean => input.providerId !== PROVIDER_GOOGLE_GMAIL || Boolean(input.gmailPubsubTopicName),
    'gmailPubsubTopicName is required for Gmail applications.',
  );

const DeleteApplicationBodySchema = z.object({
  applicationId: UuidSchema,
});

const UpdateApplicationContextBodySchema = z.object({
  applicationId: UuidSchema,
  contextIndexingEnabled: z.boolean(),
});

const DeleteApplicationContextDocumentsBodySchema = z.object({
  applicationId: UuidSchema,
});

const ApplicationContextListQuerySchema = z.object({
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

const ApplicationContextDeletionRunsQuerySchema = z.object({
  applicationId: UuidSchema.optional(),
  cursor: nonEmptyStringSchema('cursor', 64).optional(),
});

const EmailActionCallbackQuerySchema = z.object({
  token: nonEmptyStringSchema('token', 256),
});

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
});

const OAuth2AuthorizeBodySchema = z.object({
  applicationId: UuidSchema,
});

const ApplicationFoldersQuerySchema = z.object({
  applicationId: UuidSchema,
});

const UpdateApplicationWatchSettingsBodySchema = z.object({
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

const RequestInputSchemas: Record<string, RequestInputSchema> = {
  'POST /user/application': { body: CreateApplicationBodySchema },
  'PUT /user/application': { body: UpdateApplicationBodySchema },
  'DELETE /user/application': { body: DeleteApplicationBodySchema },
  'PUT /user/application/context': { body: UpdateApplicationContextBodySchema },
  'POST /user/application/context/delete-documents': { body: DeleteApplicationContextDocumentsBodySchema },
  'GET /user/application/context/documents': { query: ApplicationContextListQuerySchema },
  'GET /user/application/context/deletions': { query: ApplicationContextDeletionRunsQuerySchema },
  'GET /user/application/context/document/:contextDocumentId/provider-link': {},
  'GET /user/actions': { query: EmailActionListQuerySchema },
  'GET /user/actions/:actionId/executions': {},
  'POST /user/actions/:actionId/execute': {},
  'POST /user/application/oauth2/authorize': { body: OAuth2AuthorizeBodySchema },
  'GET /user/application/folders': { query: ApplicationFoldersQuerySchema },
  'PUT /user/application/watch-settings': { body: UpdateApplicationWatchSettingsBodySchema },
  'POST /user/application/watch': { body: WatchApplicationBodySchema },
  'POST /user/application/stop': { body: StopApplicationBodySchema },
  'GET /api/oauth2/callback/:applicationId': { query: OAuth2CallbackQuerySchema },
  'GET /api/actions/:actionId': { query: EmailActionCallbackQuerySchema },
  'POST /api/actions/:actionId/execute': { query: EmailActionCallbackQuerySchema },
  'POST /api/webhooks/gmail/:applicationId': { query: GmailWebhookQuerySchema, body: GmailWebhookBodySchema },
  'GET /api/webhooks/outlook/:applicationId': { query: OutlookWebhookQuerySchema },
  'POST /api/webhooks/outlook/:applicationId': { query: OutlookWebhookQuerySchema, body: OutlookWebhookBodySchema },
  'GET /api/webhooks/outlook/lifecycle/:applicationId': { query: OutlookWebhookQuerySchema },
  'POST /api/webhooks/outlook/lifecycle/:applicationId': { query: OutlookWebhookQuerySchema, body: OutlookWebhookBodySchema },
};

export { RequestInputSchemas };
export type { RequestInputSchema };
