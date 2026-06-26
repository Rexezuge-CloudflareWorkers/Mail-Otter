import { z } from 'zod';
import {
  CONNECTION_METHOD_IMAP_PASSWORD,
  CONNECTION_METHOD_OAUTH2,
  IMAP_PROVIDERS,
  PROVIDER_APPLE_ICLOUD,
  PROVIDER_CUSTOM_IMAP,
  PROVIDER_FASTMAIL_JMAP,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
  PROVIDER_YAHOO_MAIL,
  PROVIDER_SUPPORTED_CONNECTION_METHODS,
  MAX_RULE_MATCHERS,
  PRE_PROCESSING_ACTION_TYPES,
} from '../constants';

const UUID_PATTERN: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GMAIL_PUBSUB_TOPIC_PATTERN: RegExp = /^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/topics\/[A-Za-z][\w.~+%-]{2,254}$/;

const UuidSchema = z.string().regex(UUID_PATTERN, 'Value must be a valid UUID.');
const EmailSchema = z.string().email('Value must be a valid email address.').max(320);
const nonEmptyStringSchema = (fieldName: string, maxLength: number = 2048) =>
  z
    .string()
    .min(1, `${fieldName} is required.`)
    .max(maxLength, `${fieldName} must be ${maxLength} characters or less.`)
    .refine((value: string): boolean => value.trim().length > 0, `${fieldName} is required.`);

const GmailPubsubTopicNameSchema = z
  .string()
  .regex(GMAIL_PUBSUB_TOPIC_PATTERN, 'gmailPubsubTopicName must look like projects/{projectId}/topics/{topicName}.');
const ProviderIdSchema = z.enum([
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
  PROVIDER_FASTMAIL_JMAP,
  PROVIDER_YAHOO_MAIL,
  PROVIDER_CUSTOM_IMAP,
  PROVIDER_APPLE_ICLOUD,
]);
const ConnectionMethodSchema = z.enum([CONNECTION_METHOD_OAUTH2, CONNECTION_METHOD_IMAP_PASSWORD]);

const ConnectedAppBaseSchema = z
  .object({
    displayName: nonEmptyStringSchema('displayName', 128),
    providerId: ProviderIdSchema,
    connectionMethod: ConnectionMethodSchema,
    clientId: z.string().max(512).optional(),
    clientSecret: z.string().max(2048).optional(),
    gmailPubsubTopicName: GmailPubsubTopicNameSchema.optional(),
    imapHost: z.string().max(253).optional(),
    imapPort: z.number().int().min(1).max(65_535).optional(),
    imapUsername: z.string().max(320).optional(),
    imapPassword: z.string().max(512).optional(),
    smtpHost: z.string().max(253).optional(),
    smtpPort: z.number().int().min(1).max(65_535).optional(),
  })
  .refine(
    (input): boolean =>
      (PROVIDER_SUPPORTED_CONNECTION_METHODS[input.providerId]?.includes(input.connectionMethod)) ?? false,
    'providerId and connectionMethod are not a supported combination.',
  )
  .refine(
    (input): boolean =>
      input.providerId !== PROVIDER_GOOGLE_GMAIL ||
      input.connectionMethod !== CONNECTION_METHOD_OAUTH2 ||
      Boolean(input.gmailPubsubTopicName),
    'gmailPubsubTopicName is required for Gmail OAuth2 applications.',
  )
  .refine(
    (input): boolean => !IMAP_PROVIDERS.has(input.providerId) || Boolean(input.imapHost),
    'imapHost is required for IMAP providers.',
  )
  .refine(
    (input): boolean =>
      !(IMAP_PROVIDERS.has(input.providerId) || input.connectionMethod === CONNECTION_METHOD_IMAP_PASSWORD) ||
      Boolean(input.imapUsername),
    'imapUsername is required for IMAP providers and when using IMAP password authentication.',
  )
  .refine(
    (input): boolean => input.connectionMethod !== CONNECTION_METHOD_OAUTH2 || Boolean(input.clientId),
    'clientId is required for OAuth2 providers.',
  )
  .refine(
    (input): boolean => input.connectionMethod !== CONNECTION_METHOD_OAUTH2 || Boolean(input.clientSecret) || Boolean((input as { applicationId?: string }).applicationId),
    'clientSecret is required for new OAuth2 applications.',
  );

const positiveIntegerBodySchema = (fieldName: string) => z.number().int().min(1, `${fieldName} must be at least 1.`);

const EmailRuleConditionMatcherSchema = z.union([
  z.object({
    field: z.enum(['from']),
    op: z.enum(['contains', 'not_contains', 'matches_sender']),
    value: z.string().min(1, 'value is required.').max(200, 'value must be 200 characters or less.'),
  }),
  z.object({
    field: z.enum(['subject', 'body']),
    op: z.enum(['contains', 'not_contains']),
    value: z.string().min(1, 'value is required.').max(200, 'value must be 200 characters or less.'),
  }),
  z.object({
    field: z.literal('has_attachment'),
    op: z.literal('is'),
    value: z.enum(['true', 'false']),
  }),
  z.object({
    field: z.literal('detected_action_type'),
    op: z.enum(['includes', 'not_includes']),
    value: z.string().min(1, 'value is required.').max(200, 'value must be 200 characters or less.'),
  }),
  z.object({
    field: z.literal('always'),
    op: z.literal('match_all'),
  }),
]);

const EmailRuleConditionSchema = z.object({
  operator: z.enum(['all', 'any']),
  matchers: z.array(EmailRuleConditionMatcherSchema).min(1, 'At least one matcher is required.').max(MAX_RULE_MATCHERS, `Maximum ${MAX_RULE_MATCHERS} matchers per rule.`),
});

const EmailRuleActionSchema = z
  .object({
    type: z.enum(['skip', 'skip_actions', 'prepend_instruction', 'apply_label', 'archive_message', 'mark_read', 'star_message']),
    instruction: z.string().min(1).max(500).optional(),
    labelName: z.string().min(1).max(100).optional(),
  })
  .refine(
    (action): boolean => action.type !== 'prepend_instruction' || Boolean(action.instruction?.trim()),
    'instruction is required for prepend_instruction action.',
  )
  .refine(
    (action): boolean => action.type !== 'apply_label' || Boolean(action.labelName?.trim()),
    'labelName is required for apply_label action.',
  );

const EmailProcessingRuleSchema = z
  .object({
    ruleId: UuidSchema,
    name: z.string().min(1, 'name is required.').max(100, 'name must be 100 characters or less.'),
    enabled: z.boolean(),
    conditions: EmailRuleConditionSchema,
    action: EmailRuleActionSchema,
  })
  .refine(
    (rule): boolean => {
      if (!PRE_PROCESSING_ACTION_TYPES.has(rule.action.type)) return true;
      return rule.conditions.matchers.every((m) => m.field !== 'detected_action_type');
    },
    'detected_action_type matcher is only valid with post-processing action types (apply_label, archive_message, mark_read, star_message).',
  );

export {
  ConnectedAppBaseSchema as ConnectedApplicationBaseSchema,
  ConnectionMethodSchema,
  EmailProcessingRuleSchema,
  EmailRuleActionSchema,
  EmailRuleConditionMatcherSchema,
  EmailRuleConditionSchema,
  EmailSchema,
  GmailPubsubTopicNameSchema,
  ProviderIdSchema,
  UuidSchema,
  nonEmptyStringSchema,
  positiveIntegerBodySchema,
};
