import type { ApplicationContextDocumentSource, CalendarAddEventActionPayload, ConnectedApplicationMetadata, EmailActionResult, EmailDraftReplyActionPayload } from '@mail-otter/shared/model';

interface ProviderFolder {
  id: string;
  name: string;
}

interface ProviderCredentials {
  type: 'oauth2';
  accessToken: string;
  /** For IMAP XOAUTH2: the mailbox email address to authenticate as. */
  imapUsername?: string;
}

interface ImapProviderCredentials {
  type: 'imap-password';
  username: string;
  password: string;
  host: string;
  port: number;
}

type AnyProviderCredentials = ProviderCredentials | ImapProviderCredentials;

interface StartWatchInput {
  baseUrl: string;
  applicationId?: string;
  watchedFolderIds?: string[];
  gmailPubsubTopicName?: string;
  clientState?: string;
  expiresAt?: number;
}

interface WebhookWatchResult {
  type: 'webhook';
  externalSubscriptionId?: string;
  webhookSecretHash?: string;
  clientStateHash?: string;
  resource?: string;
  expiresAt?: number;
  gmailHistoryId?: string;
  webhookUrl?: string;
  message?: string;
}

interface ImapCursorWatchResult {
  type: 'imap-cursor';
  imapCursor: string;
}

type ProviderWatchResult = WebhookWatchResult | ImapCursorWatchResult;

interface ProviderMessageSummary {
  uid: number;
  messageId: string;
}

interface IEmailProvider {
  readonly providerId: string;
  readonly supportsWebhooks: boolean;

  listFolders(accessToken: string): Promise<ProviderFolder[]>;

  stopWatch(accessToken: string, externalSubscriptionId?: string): Promise<void>;

  startWatch(credentials: AnyProviderCredentials, input: StartWatchInput): Promise<ProviderWatchResult>;

  renewWatch(credentials: AnyProviderCredentials, subscriptionId: string, expiresAt: number | null): Promise<ProviderWatchResult>;

  pollNewMessages(credentials: AnyProviderCredentials, cursor: string | null): Promise<{ messages: ProviderMessageSummary[]; newCursor: string }>;

  getProviderUrl(document: ApplicationContextDocumentSource, application: ConnectedApplicationMetadata): string;

  createCalendarEvent(accessToken: string, payload: CalendarAddEventActionPayload): Promise<EmailActionResult>;

  createDraftReply(accessToken: string, messageId: string, fromEmail: string, payload: EmailDraftReplyActionPayload): Promise<EmailActionResult>;

  applyLabel?(accessToken: string, messageId: string, labelName: string): Promise<void>;
  archiveMessage?(accessToken: string, messageId: string): Promise<void>;
  markRead?(accessToken: string, messageId: string): Promise<void>;
  starMessage?(accessToken: string, messageId: string): Promise<void>;
  listLabels?(accessToken: string): Promise<Array<{ id: string; name: string }>>;
}

export type {
  AnyProviderCredentials,
  IEmailProvider,
  ImapCursorWatchResult,
  ImapProviderCredentials,
  ProviderCredentials,
  ProviderFolder,
  ProviderMessageSummary,
  ProviderWatchResult,
  StartWatchInput,
  WebhookWatchResult,
};
