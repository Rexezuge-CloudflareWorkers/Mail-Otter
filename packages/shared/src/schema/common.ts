import { z } from 'zod';
import { CONNECTION_METHOD_OAUTH2, PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK, SUPPORTED_PROVIDER_CONNECTIONS } from '../constants';

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
const ProviderIdSchema = z.enum([PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK]);
const ConnectionMethodSchema = z.enum([CONNECTION_METHOD_OAUTH2]);

const ConnectedApplicationBaseSchema = z
  .object({
    displayName: nonEmptyStringSchema('displayName', 128),
    providerId: ProviderIdSchema,
    connectionMethod: ConnectionMethodSchema,
    clientId: nonEmptyStringSchema('clientId', 512),
    clientSecret: nonEmptyStringSchema('clientSecret', 2048),
    gmailPubsubTopicName: GmailPubsubTopicNameSchema.optional(),
  })
  .refine(
    (input): boolean => SUPPORTED_PROVIDER_CONNECTIONS[input.providerId] === input.connectionMethod,
    'providerId and connectionMethod are not a supported combination.',
  )
  .refine(
    (input): boolean => input.providerId !== PROVIDER_GOOGLE_GMAIL || Boolean(input.gmailPubsubTopicName),
    'gmailPubsubTopicName is required for Gmail applications.',
  );

const positiveIntegerBodySchema = (fieldName: string) => z.number().int().min(1, `${fieldName} must be at least 1.`);

export {
  ConnectedApplicationBaseSchema,
  ConnectionMethodSchema,
  EmailSchema,
  GmailPubsubTopicNameSchema,
  ProviderIdSchema,
  UuidSchema,
  nonEmptyStringSchema,
  positiveIntegerBodySchema,
};
