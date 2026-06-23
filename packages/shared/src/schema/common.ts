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
} from '../constants';
import type { ConnectionMethod, ProviderId } from '../constants';

const UUID_PATTERN: RegExp = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const GMAIL_PUBSUB_TOPIC_PATTERN: RegExp = /^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/topics\/[A-Za-z][A-Za-z0-9_.~+%-]{2,254}$/;

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

const ConnectedApplicationBaseSchema = z
  .object({
    displayName: nonEmptyStringSchema('displayName', 128),
    providerId: ProviderIdSchema,
    connectionMethod: ConnectionMethodSchema,
    clientId: z.string().max(512).optional(),
    clientSecret: z.string().max(2048).optional(),
    gmailPubsubTopicName: GmailPubsubTopicNameSchema.optional(),
    imapHost: z.string().max(253).optional(),
    imapPort: z.number().int().min(1).max(65535).optional(),
    imapUsername: z.string().max(320).optional(),
    imapPassword: z.string().max(512).optional(),
    smtpHost: z.string().max(253).optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
  })
  .refine(
    (input): boolean =>
      (PROVIDER_SUPPORTED_CONNECTION_METHODS[input.providerId as ProviderId]?.includes(input.connectionMethod as ConnectionMethod)) ?? false,
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

const EmailRuleConditionMatcherSchema = z
  .object({
    field: z.enum(['from', 'subject', 'body']),
    op: z.enum(['contains', 'not_contains', 'matches_sender']),
    value: z.string().min(1, 'value is required.').max(200, 'value must be 200 characters or less.'),
  })
  .refine(
    (matcher): boolean => matcher.op !== 'matches_sender' || matcher.field === 'from',
    'matches_sender operator is only valid for the from field.',
  );

const EmailRuleConditionSchema = z.object({
  operator: z.enum(['all', 'any']),
  matchers: z.array(EmailRuleConditionMatcherSchema).min(1, 'At least one matcher is required.').max(MAX_RULE_MATCHERS, `Maximum ${MAX_RULE_MATCHERS} matchers per rule.`),
});

const EmailRuleActionSchema = z
  .object({
    type: z.enum(['skip', 'skip_actions', 'prepend_instruction']),
    instruction: z.string().min(1).max(500).optional(),
  })
  .refine(
    (action): boolean => action.type !== 'prepend_instruction' || Boolean(action.instruction?.trim()),
    'instruction is required for prepend_instruction action.',
  );

const EmailProcessingRuleSchema = z.object({
  ruleId: UuidSchema,
  name: z.string().min(1, 'name is required.').max(100, 'name must be 100 characters or less.'),
  enabled: z.boolean(),
  conditions: EmailRuleConditionSchema,
  action: EmailRuleActionSchema,
});

export {
  ConnectedApplicationBaseSchema,
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
